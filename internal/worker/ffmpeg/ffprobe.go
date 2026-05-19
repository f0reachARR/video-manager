// Package ffmpeg wraps the local ffmpeg/ffprobe binaries to extract video
// metadata. Phase 1 only uses ffprobe.
package ffmpeg

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"time"
)

type Metadata struct {
	RecordedAt   *time.Time
	DurationSec  *int32
	Width        *int32
	Height       *int32
	VideoCodec   string // e.g. "h264", "hevc"
	VideoProfile string // e.g. "Main", "High"
	AudioCodec   string // e.g. "aac", "mp3", "" when no audio
}

// Probe runs `ffprobe -show_format -of json` against the given input URL or
// path. Returns extracted creation_time and duration when present.
func Probe(ctx context.Context, input string) (Metadata, error) {
	cmd := exec.CommandContext(ctx,
		"ffprobe",
		"-v", "error",
		"-print_format", "json",
		"-show_format",
		"-show_streams",
		input,
	)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return Metadata{}, fmt.Errorf("ffprobe: %w (stderr=%q)", err, stderr.String())
	}
	return parse(stdout.Bytes())
}

type ffprobeOutput struct {
	Format struct {
		Duration string            `json:"duration"`
		Tags     map[string]string `json:"tags"`
	} `json:"format"`
	Streams []ffprobeStream `json:"streams"`
}

type ffprobeStream struct {
	CodecType string            `json:"codec_type"` // "video" / "audio"
	CodecName string            `json:"codec_name"` // "h264" / "aac" ...
	Profile   string            `json:"profile"`    // "Main", "High", ...
	Width     int               `json:"width"`
	Height    int               `json:"height"`
	Tags      map[string]string `json:"tags"`
}

var creationTimeFormats = []string{
	time.RFC3339Nano,
	time.RFC3339,
	"2006-01-02T15:04:05.000000Z",
	"2006-01-02 15:04:05",
}

func parse(raw []byte) (Metadata, error) {
	var out ffprobeOutput
	if err := json.Unmarshal(raw, &out); err != nil {
		return Metadata{}, fmt.Errorf("decode ffprobe json: %w", err)
	}
	m := Metadata{}
	if out.Format.Duration != "" {
		if d, err := strconv.ParseFloat(out.Format.Duration, 64); err == nil {
			sec := int32(d + 0.5)
			m.DurationSec = &sec
		}
	}
	if t := pickCreationTime(out); t != nil {
		m.RecordedAt = t
	}
	for _, s := range out.Streams {
		switch s.CodecType {
		case "video":
			if m.VideoCodec == "" {
				m.VideoCodec = s.CodecName
				m.VideoProfile = s.Profile
				if s.Width > 0 {
					w := int32(s.Width)
					m.Width = &w
				}
				if s.Height > 0 {
					h := int32(s.Height)
					m.Height = &h
				}
			}
		case "audio":
			if m.AudioCodec == "" {
				m.AudioCodec = s.CodecName
			}
		}
	}
	return m, nil
}

func pickCreationTime(out ffprobeOutput) *time.Time {
	candidates := []string{out.Format.Tags["creation_time"]}
	for _, s := range out.Streams {
		if v := s.Tags["creation_time"]; v != "" {
			candidates = append(candidates, v)
		}
	}
	for _, c := range candidates {
		if c == "" {
			continue
		}
		for _, layout := range creationTimeFormats {
			if t, err := time.Parse(layout, c); err == nil {
				utc := t.UTC()
				return &utc
			}
		}
	}
	return nil
}

// IsAvailable returns true if ffprobe is in PATH.
func IsAvailable() bool {
	_, err := exec.LookPath("ffprobe")
	return err == nil
}

// FFmpegAvailable returns true if ffmpeg (used for thumbnail extraction) is in PATH.
func FFmpegAvailable() bool {
	_, err := exec.LookPath("ffmpeg")
	return err == nil
}

// ErrNotAvailable is returned by callers when ffprobe is not installed.
var ErrNotAvailable = errors.New("ffprobe binary not found in PATH")

// ExtractThumbnail uses ffmpeg to grab a single JPEG frame at the given offset
// (seconds), scaled to maxWidth pixels wide (height auto). The thumbnail bytes
// are returned in memory — Phase 1 thumbnails are small (<100 KB).
func ExtractThumbnail(ctx context.Context, input string, offsetSec float64, maxWidth int) ([]byte, error) {
	if maxWidth <= 0 {
		maxWidth = 320
	}
	if offsetSec < 0 {
		offsetSec = 0
	}
	cmd := exec.CommandContext(ctx,
		"ffmpeg",
		"-y",
		"-ss", strconv.FormatFloat(offsetSec, 'f', 3, 64),
		"-i", input,
		"-frames:v", "1",
		"-vf", fmt.Sprintf("scale=%d:-2", maxWidth),
		"-f", "image2",
		"-vcodec", "mjpeg",
		"pipe:1",
	)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg thumbnail: %w (stderr=%q)", err, stderr.String())
	}
	if stdout.Len() == 0 {
		return nil, errors.New("ffmpeg produced empty thumbnail")
	}
	return stdout.Bytes(), nil
}
