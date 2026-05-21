package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/f0reachARR/video-manager/internal/hlsrunner/ffmpeg"
	"github.com/f0reachARR/video-manager/internal/hlswire"
	"github.com/f0reachARR/video-manager/internal/storage"
)

// runProbe handles a TypeProbe job: ffprobe + thumbnail extraction + S3 upload.
// Returns the body to post to /complete on success.
func runProbe(ctx context.Context, _ *apiClient, store *storage.Client, job *hlswire.ClaimResponse) (any, error) {
	var claim hlswire.ProbeClaim
	if err := json.Unmarshal(job.Payload, &claim); err != nil {
		return nil, fmt.Errorf("decode probe claim: %w", err)
	}

	if !ffmpeg.IsAvailable() {
		return nil, errors.New("ffprobe not available")
	}

	meta, err := ffmpeg.Probe(ctx, claim.SourceURL)
	if err != nil {
		return nil, fmt.Errorf("ffprobe: %w", err)
	}

	// Apply the device's default time offset before reporting back.
	if meta.RecordedAt != nil && claim.DeviceTimeOffsetSec != 0 {
		adjusted := meta.RecordedAt.Add(-time.Duration(claim.DeviceTimeOffsetSec) * time.Second)
		meta.RecordedAt = &adjusted
	}

	out := hlswire.ProbeComplete{
		LeaseAuth:     hlswire.LeaseAuth{LeaseToken: job.LeaseToken},
		RecordedAt:    meta.RecordedAt,
		DurationSec:   meta.DurationSec,
		VideoCodec:    meta.VideoCodec,
		AudioCodec:    meta.AudioCodec,
		Width:         meta.Width,
		Height:        meta.Height,
		PassthroughOK: ffmpeg.PassthroughOK(meta),
	}

	// Thumbnail extraction is best-effort: if ffmpeg is missing or the input
	// is unreadable at the picked offset we still report the probe results.
	if ffmpeg.FFmpegAvailable() && claim.ThumbnailKey != "" {
		offset := 1.0
		if meta.DurationSec != nil && float64(*meta.DurationSec) < 2 {
			offset = 0
		}
		thumb, err := ffmpeg.ExtractThumbnail(ctx, claim.SourceURL, offset, 320)
		if err != nil {
			slog.Warn("thumbnail extract failed", "jobId", job.JobID, "error", err)
		} else if err := store.PutBytes(ctx, claim.ThumbnailKey, "image/jpeg", thumb); err != nil {
			slog.Warn("thumbnail upload failed", "jobId", job.JobID, "error", err)
		} else {
			out.ThumbnailKey = claim.ThumbnailKey
		}
	}

	return out, nil
}
