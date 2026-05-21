package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
	"github.com/f0reachARR/video-manager/internal/hlswire"
	"github.com/f0reachARR/video-manager/internal/storage"
	"github.com/f0reachARR/video-manager/internal/worker/dispatch"
)

// EncodeVariantArgs is the payload for a single video.hls.encode_variant job.
type EncodeVariantArgs struct {
	VideoID     string `json:"videoId"`
	RenditionID string `json:"renditionId"`
}

func (EncodeVariantArgs) Kind() string { return "video.hls.encode_variant" }

func (EncodeVariantArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue: QueueEncode,
		// Same (videoId, renditionId) tuple should never be queued twice while
		// already pending or running. River retries are still allowed via
		// MaxAttempts; ByState here applies to inserts only.
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
		},
		MaxAttempts: 3,
	}
}

// EncodeVariantWorker hands an encode_variant job off to the external
// hls-worker. It prepares (presigns source, clears prior S3 prefix, flips
// rendition status), submits the job to the dispatcher, applies progress
// updates as the worker reports them, and marks the rendition ready/failed
// based on the outcome.
type EncodeVariantWorker struct {
	river.WorkerDefaults[EncodeVariantArgs]
	Q          *sqlc.Queries
	Storage    *storage.Client
	Manager    *Manager
	Dispatcher *dispatch.Dispatcher
}

func (w *EncodeVariantWorker) Timeout(_ *river.Job[EncodeVariantArgs]) time.Duration {
	// long encodes are expected; cap at 6h to bound runaway jobs.
	return 6 * time.Hour
}

// presignEncodeTTL matches the worker Timeout so a single presigned URL is
// good for the entire encode without re-issuing.
const presignEncodeTTL = 6 * time.Hour

func (w *EncodeVariantWorker) Work(ctx context.Context, job *river.Job[EncodeVariantArgs]) (workErr error) {
	renditionID, err := uuid.Parse(job.Args.RenditionID)
	if err != nil {
		return fmt.Errorf("invalid renditionId: %w", err)
	}
	videoID, err := uuid.Parse(job.Args.VideoID)
	if err != nil {
		return fmt.Errorf("invalid videoId: %w", err)
	}

	rendPgID := pgtype.UUID{Bytes: renditionID, Valid: true}
	videoPgID := pgtype.UUID{Bytes: videoID, Valid: true}

	rend, err := w.Q.GetRendition(ctx, rendPgID)
	if err != nil {
		return fmt.Errorf("get rendition: %w", err)
	}
	if rend.VideoID.Bytes != videoPgID.Bytes {
		return errors.New("rendition does not belong to videoId arg")
	}

	v, err := w.Q.GetVideo(ctx, videoPgID)
	if err != nil {
		return fmt.Errorf("get video: %w", err)
	}

	// Mark encoding *before* clearing S3 so failure between the two leaves the
	// row in a state consistent with the storage.
	if _, err := w.Q.MarkRenditionEncoding(ctx, rendPgID); err != nil {
		return fmt.Errorf("mark encoding: %w", err)
	}

	// On any error from this point onward, mark the rendition failed and let
	// River retry. We use a closure so the deferred error path always fires.
	defer func() {
		if workErr == nil {
			return
		}
		msg := workErr.Error()
		if len(msg) > 1000 {
			msg = msg[:1000]
		}
		if _, derr := w.Q.MarkRenditionFailed(context.Background(), sqlc.MarkRenditionFailedParams{
			ID:    rendPgID,
			Error: msg,
		}); derr != nil {
			slog.Warn("mark rendition failed: db update error", "renditionId", rend.ID.String(), "error", derr)
		}
		// Attempt finalize so the master playlist transitions to "failed"
		// even if some other rendition is still running. Finalize uses
		// SELECT-and-compare so it's safe to fire repeatedly.
		if w.Manager != nil {
			if ferr := w.Manager.EnqueueFinalize(context.Background(), v.ID.String()); ferr != nil {
				slog.Warn("enqueue finalize after failure", "videoId", v.ID.String(), "error", ferr)
			}
		}
	}()

	// Clear any partial output from a previous attempt so we always start with
	// a clean playlist on S3.
	hlsPrefix := fmt.Sprintf("hls/%s/%s/", v.ID.String(), string(rend.Kind))
	if err := w.Storage.DeletePrefix(ctx, hlsPrefix); err != nil {
		return fmt.Errorf("clear hls prefix: %w", err)
	}

	srcURL, _, err := w.Storage.PresignGetWithTTL(ctx, v.StorageKey, presignEncodeTTL)
	if err != nil {
		return fmt.Errorf("presign source: %w", err)
	}

	claim := hlswire.EncodeClaim{
		VideoID:     v.ID.String(),
		RenditionID: rend.ID.String(),
		SourceURL:   srcURL,
		HLSPrefix:   hlsPrefix,
		Passthrough: rend.Passthrough,
		SegmentSec:  6,
	}
	if !rend.Passthrough {
		claim.Width = rend.Width
		claim.Height = rend.Height
		claim.VideoBitrate = videoBitrateFor(rend.Kind)
		claim.AudioBitrate = audioBitrateFor(rend.Kind)
	}
	payload, err := json.Marshal(claim)
	if err != nil {
		return fmt.Errorf("marshal encode claim: %w", err)
	}

	// Progress callback applies SegmentsDone monotonically. We compare against
	// the last value we observed so retransmits (worker retrying a /progress
	// after a transient API error) don't cause regressions in the DB.
	var lastSegments int32
	onProgress := func(ctx context.Context, body json.RawMessage) error {
		var p hlswire.EncodeProgress
		if err := json.Unmarshal(body, &p); err != nil {
			return fmt.Errorf("decode progress: %w", err)
		}
		if p.SegmentsDone <= lastSegments {
			return nil
		}
		delta := p.SegmentsDone - lastSegments
		lastSegments = p.SegmentsDone
		for i := int32(0); i < delta; i++ {
			if _, err := w.Q.IncrementRenditionSegments(ctx, rendPgID); err != nil {
				slog.Warn("increment segments_done failed", "renditionId", rend.ID.String(), "error", err)
			}
		}
		return nil
	}

	res := w.Dispatcher.Submit(ctx, &dispatch.Job{
		Type:       hlswire.TypeEncodeVariant,
		Queue:      hlswire.QueueEncode,
		Payload:    payload,
		OnProgress: onProgress,
	})
	if res.Err != nil {
		return fmt.Errorf("encode via worker: %w", res.Err)
	}

	bw := rend.BandwidthBps
	if _, err := w.Q.MarkRenditionReady(ctx, sqlc.MarkRenditionReadyParams{
		ID:           rendPgID,
		BandwidthBps: bw,
	}); err != nil {
		return fmt.Errorf("mark ready: %w", err)
	}
	slog.Info("rendition encode complete", "videoId", v.ID.String(), "kind", rend.Kind, "passthrough", rend.Passthrough)

	if w.Manager != nil {
		if err := w.Manager.EnqueueFinalize(ctx, v.ID.String()); err != nil {
			slog.Warn("enqueue finalize", "videoId", v.ID.String(), "error", err)
		}
	}
	return nil
}

func videoBitrateFor(kind sqlc.RenditionKind) string {
	switch kind {
	case sqlc.RenditionKind720p:
		return "2500k"
	case sqlc.RenditionKind480p:
		return "1200k"
	default:
		return "5000k"
	}
}

func audioBitrateFor(kind sqlc.RenditionKind) string {
	if kind == sqlc.RenditionKindOriginal {
		return "192k"
	}
	return "128k"
}
