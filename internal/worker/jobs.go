// Package worker wires River background jobs for the video pipeline.
package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"

	"github.com/f0reachARR/soiree/internal/db/sqlc"
	"github.com/f0reachARR/soiree/internal/hlswire"
	"github.com/f0reachARR/soiree/internal/storage"
	"github.com/f0reachARR/soiree/internal/worker/dispatch"
)

// ProbeVideoArgs is the payload for the per-video metadata extraction job.
type ProbeVideoArgs struct {
	VideoID string `json:"videoId"`
}

func (ProbeVideoArgs) Kind() string { return "video.probe" }

// ProbeVideoWorker handles a video.probe River job by dispatching it to the
// external hls-worker. The River worker itself never touches ffmpeg — it
// builds a presigned source URL, hands the job off, then applies the result
// to the DB once the external worker reports completion.
type ProbeVideoWorker struct {
	river.WorkerDefaults[ProbeVideoArgs]
	Q          *sqlc.Queries
	Storage    *storage.Client
	Manager    *Manager
	Dispatcher *dispatch.Dispatcher
}

// presignProbeTTL is how long the worker has to fetch the source for ffprobe.
// Probe is fast so a short TTL is fine; longer TTLs are wasted blast radius.
const presignProbeTTL = 30 * time.Minute

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

	var deviceOffsetSec int32
	if v.DeviceID.Valid {
		dev, err := w.Q.GetDevice(ctx, v.DeviceID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			slog.Warn("device lookup failed; using zero offset", "error", err)
		}
		if dev.ID.Valid {
			deviceOffsetSec = dev.DefaultTimeOffsetSec
		}
	}

	sourceURL, _, err := w.Storage.PresignGetWithTTL(ctx, v.StorageKey, presignProbeTTL)
	if err != nil {
		return fmt.Errorf("presign source: %w", err)
	}

	claim := hlswire.ProbeClaim{
		VideoID:             v.ID.String(),
		SourceURL:           sourceURL,
		ThumbnailKey:        "thumbnails/" + v.StorageKey + ".jpg",
		DeviceTimeOffsetSec: deviceOffsetSec,
	}
	payload, err := json.Marshal(claim)
	if err != nil {
		return fmt.Errorf("marshal probe claim: %w", err)
	}

	res := w.Dispatcher.Submit(ctx, &dispatch.Job{
		Type:    hlswire.TypeProbe,
		Queue:   hlswire.QueueProbe,
		Payload: payload,
	})
	if res.Err != nil {
		return fmt.Errorf("probe via worker: %w", res.Err)
	}

	var done hlswire.ProbeComplete
	if err := json.Unmarshal(res.Payload, &done); err != nil {
		return fmt.Errorf("decode probe result: %w", err)
	}

	probeParams := sqlc.UpdateVideoProbeParams{ID: pgID}
	if done.RecordedAt != nil {
		probeParams.RecordedAt = pgtype.Timestamptz{Time: *done.RecordedAt, Valid: true}
		probeParams.RecordedAtSet = true
	}
	if done.DurationSec != nil {
		probeParams.DurationSec = done.DurationSec
		probeParams.DurationSecSet = true
	}
	if _, err := w.Q.UpdateVideoProbe(ctx, probeParams); err != nil {
		return fmt.Errorf("update video probe: %w", err)
	}

	srcParams := sqlc.UpdateVideoSourceParams{
		ID:            pgID,
		PassthroughOk: done.PassthroughOK,
	}
	if done.VideoCodec != "" {
		s := done.VideoCodec
		srcParams.SourceVideoCodec = &s
	}
	if done.AudioCodec != "" {
		s := done.AudioCodec
		srcParams.SourceAudioCodec = &s
	}
	if done.Width != nil {
		srcParams.SourceWidth = done.Width
	}
	if done.Height != nil {
		srcParams.SourceHeight = done.Height
	}
	if _, err := w.Q.UpdateVideoSource(ctx, srcParams); err != nil {
		return fmt.Errorf("update video source: %w", err)
	}

	if done.ThumbnailKey != "" {
		if _, err := w.Q.UpdateVideoThumbnail(ctx, sqlc.UpdateVideoThumbnailParams{
			ID:           pgID,
			ThumbnailKey: &done.ThumbnailKey,
		}); err != nil {
			slog.Warn("thumbnail row update failed", "videoId", job.Args.VideoID, "error", err)
		}
	}

	slog.Info("video probe complete", "videoId", job.Args.VideoID,
		"recordedAt", done.RecordedAt, "durationSec", done.DurationSec,
		"videoCodec", done.VideoCodec, "audioCodec", done.AudioCodec,
		"width", done.Width, "height", done.Height,
		"passthroughOK", done.PassthroughOK)

	// Trigger HLS planning. Failing to enqueue is non-fatal — the probe job
	// itself succeeded; the planner can be retried by hand or by a scheduled
	// reconciler. We log loudly so the operator notices.
	if w.Manager != nil {
		if err := w.Manager.EnqueuePlanHLS(ctx, job.Args.VideoID); err != nil {
			slog.Warn("enqueue plan_hls failed", "videoId", job.Args.VideoID, "error", err)
		}
	}
	return nil
}
