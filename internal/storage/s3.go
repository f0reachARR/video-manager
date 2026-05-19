// Package storage wraps the S3-compatible object store (MinIO in dev) used for
// video files. It provides presign helpers and object lifecycle operations.
package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
)

type Config struct {
	Endpoint     string
	Region       string
	Bucket       string
	AccessKey    string
	SecretKey    string
	UsePathStyle bool
	PresignTTL   time.Duration
}

type Client struct {
	s3      *s3.Client
	presign *s3.PresignClient
	bucket  string
	ttl     time.Duration
}

func New(ctx context.Context, cfg Config) (*Client, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, "")),
	)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}
	// MinIO doesn't speak the newer flexible-checksum protocol the AWS SDK
	// enables by default. Disable both so presigned URLs stay compatible.
	awsCfg.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
	awsCfg.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	cli := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.Endpoint)
		o.UsePathStyle = cfg.UsePathStyle
	})
	ttl := cfg.PresignTTL
	if ttl == 0 {
		ttl = 10 * time.Minute
	}
	return &Client{
		s3:      cli,
		presign: s3.NewPresignClient(cli),
		bucket:  cfg.Bucket,
		ttl:     ttl,
	}, nil
}

func (c *Client) Bucket() string  { return c.bucket }
func (c *Client) PresignTTL() time.Duration { return c.ttl }

// PresignGet returns a time-limited GET URL for the given object key.
func (c *Client) PresignGet(ctx context.Context, key string) (string, time.Time, error) {
	return c.PresignGetWithTTL(ctx, key, c.ttl)
}

// PresignGetWithTTL is PresignGet with an explicit TTL. Used by long-running
// HLS encode jobs which need a presigned source URL valid for the whole run.
func (c *Client) PresignGetWithTTL(ctx context.Context, key string, ttl time.Duration) (string, time.Time, error) {
	if ttl <= 0 {
		ttl = c.ttl
	}
	expires := time.Now().Add(ttl)
	req, err := c.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	}, func(o *s3.PresignOptions) {
		o.Expires = ttl
	})
	if err != nil {
		return "", time.Time{}, err
	}
	return req.URL, expires, nil
}

// PutBytes uploads a small in-memory payload (used for thumbnails). It is not
// optimized for large objects — those should be streamed via the multipart API.
func (c *Client) PutBytes(ctx context.Context, key, contentType string, data []byte) error {
	_, err := c.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(c.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	return err
}

// Delete removes an object (and tusd's `.info` sidecar if present).
func (c *Client) Delete(ctx context.Context, key string) error {
	if _, err := c.s3.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	}); err != nil {
		return err
	}
	// best-effort cleanup of tusd metadata sidecar
	_, _ = c.s3.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key + ".info"),
	})
	return nil
}

// PutFile uploads a local file to the given key. Streaming the body avoids
// buffering large segments in memory.
func (c *Client) PutFile(ctx context.Context, key, contentType, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		return fmt.Errorf("stat %s: %w", path, err)
	}
	in := &s3.PutObjectInput{
		Bucket:        aws.String(c.bucket),
		Key:           aws.String(key),
		Body:          f,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(stat.Size()),
	}
	if _, err := c.s3.PutObject(ctx, in); err != nil {
		return fmt.Errorf("put %s: %w", key, err)
	}
	return nil
}

// DeletePrefix removes every object under the given key prefix. Used when an
// HLS encode is restarted (clears partial segments) or a video is deleted.
func (c *Client) DeletePrefix(ctx context.Context, prefix string) error {
	var token *string
	for {
		out, err := c.s3.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(c.bucket),
			Prefix:            aws.String(prefix),
			ContinuationToken: token,
		})
		if err != nil {
			return fmt.Errorf("list %s: %w", prefix, err)
		}
		if len(out.Contents) > 0 {
			objs := make([]s3types.ObjectIdentifier, 0, len(out.Contents))
			for _, o := range out.Contents {
				objs = append(objs, s3types.ObjectIdentifier{Key: o.Key})
			}
			if _, err := c.s3.DeleteObjects(ctx, &s3.DeleteObjectsInput{
				Bucket: aws.String(c.bucket),
				Delete: &s3types.Delete{Objects: objs, Quiet: aws.Bool(true)},
			}); err != nil {
				return fmt.Errorf("delete %s batch: %w", prefix, err)
			}
		}
		if out.IsTruncated == nil || !*out.IsTruncated {
			return nil
		}
		token = out.NextContinuationToken
	}
}

// Get returns the body and content-type of the given object. The caller must
// close the returned ReadCloser. Used by the in-process HLS proxy handler.
func (c *Client) Get(ctx context.Context, key string) (io.ReadCloser, string, int64, error) {
	out, err := c.s3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, "", 0, err
	}
	ct := ""
	if out.ContentType != nil {
		ct = *out.ContentType
	}
	size := int64(0)
	if out.ContentLength != nil {
		size = *out.ContentLength
	}
	return out.Body, ct, size, nil
}
