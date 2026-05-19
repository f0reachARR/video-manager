package worker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
	"github.com/f0reachARR/video-manager/internal/storage"
	"github.com/f0reachARR/video-manager/internal/worker/ffmpeg"
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

// EncodeVariantWorker encodes (or remuxes) one rendition of a video, uploading
// each finalized HLS segment and the updated playlist to S3 as ffmpeg writes
// them. After ffmpeg exits successfully it enqueues a finalize job; on failure
// the rendition row is marked failed and River retries via its default backoff.
type EncodeVariantWorker struct {
	river.WorkerDefaults[EncodeVariantArgs]
	Q       *sqlc.Queries
	Storage *storage.Client
	Manager *Manager
}

func (w *EncodeVariantWorker) Timeout(_ *river.Job[EncodeVariantArgs]) time.Duration {
	// long encodes are expected; cap at 6h to bound runaway jobs.
	return 6 * time.Hour
}

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

	if !ffmpeg.FFmpegAvailable() || !ffmpeg.IsAvailable() {
		return errors.New("ffmpeg/ffprobe not available on this worker")
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

	tmpDir, err := os.MkdirTemp("", "vm-hls-"+rend.ID.String()+"-")
	if err != nil {
		return fmt.Errorf("mkdtemp: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	// Long-lived presigned URL for ffmpeg input. 6h matches our worker timeout.
	srcURL, _, err := w.Storage.PresignGetWithTTL(ctx, v.StorageKey, 6*time.Hour)
	if err != nil {
		return fmt.Errorf("presign source: %w", err)
	}

	opt := ffmpeg.HLSOptions{
		Input:       srcURL,
		OutDir:      tmpDir,
		Passthrough: rend.Passthrough,
		SegmentSec:  6,
	}
	if !rend.Passthrough {
		opt.Width = int(rend.Width)
		opt.Height = int(rend.Height)
		opt.VideoBitrate = videoBitrateFor(rend.Kind)
		opt.AudioBitrate = audioBitrateFor(rend.Kind)
	}

	// Uploader fires per segment. We serialize uploads (a single goroutine via
	// a mutex) so playlist.m3u8 is always uploaded after the segments it lists.
	var mu sync.Mutex
	upload := func(name string) {
		mu.Lock()
		defer mu.Unlock()
		segKey := hlsPrefix + name
		segPath := filepath.Join(tmpDir, name)
		if err := w.Storage.PutFile(ctx, segKey, "video/mp2t", segPath); err != nil {
			slog.Warn("upload segment failed", "renditionId", rend.ID.String(), "segment", name, "error", err)
			return
		}
		playlistPath := filepath.Join(tmpDir, ffmpeg.PlaylistName)
		if _, err := os.Stat(playlistPath); err == nil {
			if err := w.Storage.PutFile(ctx, hlsPrefix+ffmpeg.PlaylistName, "application/vnd.apple.mpegurl", playlistPath); err != nil {
				slog.Warn("upload playlist failed", "renditionId", rend.ID.String(), "error", err)
			}
		}
		if _, err := w.Q.IncrementRenditionSegments(ctx, rendPgID); err != nil {
			slog.Warn("increment segments_done failed", "renditionId", rend.ID.String(), "error", err)
		}
	}

	if err := ffmpeg.RunHLS(ctx, opt, upload); err != nil {
		return fmt.Errorf("run hls: %w", err)
	}

	// Final playlist upload — ffmpeg writes #EXT-X-ENDLIST on success, and the
	// last segment notification may have raced with the rewrite.
	mu.Lock()
	finalPlaylist := filepath.Join(tmpDir, ffmpeg.PlaylistName)
	if err := w.Storage.PutFile(ctx, hlsPrefix+ffmpeg.PlaylistName, "application/vnd.apple.mpegurl", finalPlaylist); err != nil {
		mu.Unlock()
		return fmt.Errorf("upload final playlist: %w", err)
	}
	mu.Unlock()

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
