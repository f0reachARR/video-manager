// Package storage wraps the S3-compatible object store (MinIO in dev) used for
// video files. It provides presign helpers and object lifecycle operations.
package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
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
	expires := time.Now().Add(c.ttl)
	req, err := c.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	}, func(o *s3.PresignOptions) {
		o.Expires = c.ttl
	})
	if err != nil {
		return "", time.Time{}, err
	}
	return req.URL, expires, nil
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
