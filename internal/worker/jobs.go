// Package worker wires River background jobs for the video pipeline.
package worker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
	"github.com/f0reachARR/video-manager/internal/storage"
	"github.com/f0reachARR/video-manager/internal/worker/ffmpeg"
)

// ProbeVideoArgs is the payload for the per-video metadata extraction job.
type ProbeVideoArgs struct {
	VideoID string `json:"videoId"`
}

func (ProbeVideoArgs) Kind() string { return "video.probe" }

// ProbeVideoWorker reads a Video row, downloads/streams it via a presigned URL,
// runs ffprobe, then writes recorded_at + duration_sec back to the DB. The
// device's default_time_offset_sec is applied to recorded_at on write.
type ProbeVideoWorker struct {
	river.WorkerDefaults[ProbeVideoArgs]
	Q       *sqlc.Queries
	Storage *storage.Client
}

func (w *ProbeVideoWorker) Work(ctx context.Context, job *river.Job[ProbeVideoArgs]) error {
	id, err := uuid.Parse(job.Args.VideoID)
	if err != nil {
		return fmt.Errorf("invalid videoId: %w", err)
	}
	pgID := pgtype.UUID{Bytes: id, Valid: true}

	v, err := w.Q.GetVideo(ctx, pgID)
	if err != nil {
		return fmt.Errorf("get video: %w", err)
	}

	if !ffmpeg.IsAvailable() {
		slog.Warn("ffprobe not available; skipping metadata extraction", "videoId", job.Args.VideoID)
		return ffmpeg.ErrNotAvailable
	}

	url, _, err := w.Storage.PresignGet(ctx, v.StorageKey)
	if err != nil {
		return fmt.Errorf("presign get: %w", err)
	}

	meta, err := ffmpeg.Probe(ctx, url)
	if err != nil {
		return fmt.Errorf("probe: %w", err)
	}

	// Apply the device's default time offset to recorded_at, if available.
	if meta.RecordedAt != nil && v.DeviceID.Valid {
		dev, err := w.Q.GetDevice(ctx, v.DeviceID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			slog.Warn("device lookup failed; using raw recorded_at", "error", err)
		}
		if dev.ID.Valid && dev.DefaultTimeOffsetSec != 0 {
			adjusted := meta.RecordedAt.Add(-1 * secondsToDuration(dev.DefaultTimeOffsetSec))
			meta.RecordedAt = &adjusted
		}
	}

	params := sqlc.UpdateVideoProbeParams{ID: pgID}
	if meta.RecordedAt != nil {
		params.RecordedAt = pgtype.Timestamptz{Time: *meta.RecordedAt, Valid: true}
		params.RecordedAtSet = true
	}
	if meta.DurationSec != nil {
		params.DurationSec = meta.DurationSec
		params.DurationSecSet = true
	}
	if _, err := w.Q.UpdateVideoProbe(ctx, params); err != nil {
		return fmt.Errorf("update video: %w", err)
	}

	// Thumbnail extraction is best-effort: ffmpeg may be missing, the video
	// may be unreadable, etc. We log and continue rather than failing the job.
	if ffmpeg.FFmpegAvailable() {
		offset := 1.0
		if meta.DurationSec != nil && float64(*meta.DurationSec) < 2 {
			offset = 0
		}
		thumb, err := ffmpeg.ExtractThumbnail(ctx, url, offset, 320)
		if err != nil {
			slog.Warn("thumbnail extraction failed", "videoId", job.Args.VideoID, "error", err)
		} else {
			thumbKey := "thumbnails/" + v.StorageKey + ".jpg"
			if err := w.Storage.PutBytes(ctx, thumbKey, "image/jpeg", thumb); err != nil {
				slog.Warn("thumbnail upload failed", "videoId", job.Args.VideoID, "error", err)
			} else if _, err := w.Q.UpdateVideoThumbnail(ctx, sqlc.UpdateVideoThumbnailParams{
				ID:           pgID,
				ThumbnailKey: &thumbKey,
			}); err != nil {
				slog.Warn("thumbnail row update failed", "videoId", job.Args.VideoID, "error", err)
			}
		}
	}

	slog.Info("video probe complete", "videoId", job.Args.VideoID,
		"recordedAt", meta.RecordedAt, "durationSec", meta.DurationSec)
	return nil
}

func secondsToDuration(s int32) time.Duration {
	return time.Duration(s) * time.Second
}
