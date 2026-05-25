package worker

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"

	"github.com/f0reachARR/soiree/internal/db/sqlc"
	"github.com/f0reachARR/soiree/internal/storage"
)

// FinalizeHLSArgs is the payload for video.hls.finalize jobs.
type FinalizeHLSArgs struct {
	VideoID string `json:"videoId"`
}

func (FinalizeHLSArgs) Kind() string { return "video.hls.finalize" }

func (FinalizeHLSArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue: QueueDefault,
		// Dedup queued finalize jobs by videoId, but NOT once the prior
		// finalize is in `completed` state. River's default UniqueOpts.ByState
		// includes Completed, which would silently skip every encode_variant's
		// final EnqueueFinalize once the first finalize has run (and exited
		// early because not all renditions were ready yet). Excluding Completed
		// here lets the last encode_variant trigger the master-playlist write.
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
			ByState: []rivertype.JobState{
				rivertype.JobStateAvailable,
				rivertype.JobStatePending,
				rivertype.JobStateRetryable,
				rivertype.JobStateRunning,
				rivertype.JobStateScheduled,
			},
		},
	}
}

// FinalizeHLSWorker writes the master playlist once all renditions are ready,
// or marks the video failed if any rendition has failed. Until then it exits
// successfully without changing state — encode_variant jobs re-trigger it
// whenever they complete.
type FinalizeHLSWorker struct {
	river.WorkerDefaults[FinalizeHLSArgs]
	Q       *sqlc.Queries
	Storage *storage.Client
	Manager *Manager
}

// finalizeRecheckDelay is how long we wait before re-checking if some
// rendition is still mid-encode when finalize runs. This covers the residual
// race where two encode_variants complete during a single finalize run — both
// of their EnqueueFinalize calls get deduped against the currently-running
// job, and without this self-reschedule no one would ever trigger the master
// write afterward.
const finalizeRecheckDelay = 10 * time.Second

func (w *FinalizeHLSWorker) Work(ctx context.Context, job *river.Job[FinalizeHLSArgs]) error {
	id, err := uuid.Parse(job.Args.VideoID)
	if err != nil {
		return fmt.Errorf("invalid videoId: %w", err)
	}
	pgID := pgtype.UUID{Bytes: id, Valid: true}

	rends, err := w.Q.ListRenditionsByVideo(ctx, pgID)
	if err != nil {
		return fmt.Errorf("list renditions: %w", err)
	}
	if len(rends) == 0 {
		slog.Info("finalize: no renditions yet", "videoId", job.Args.VideoID)
		return nil
	}

	anyFailed := false
	anyEncoding := false
	allReady := true
	for _, r := range rends {
		switch r.Status {
		case sqlc.RenditionStatusFailed:
			anyFailed = true
			allReady = false
		case sqlc.RenditionStatusEncoding, sqlc.RenditionStatusPending:
			anyEncoding = true
			allReady = false
		case sqlc.RenditionStatusReady:
			// ok
		}
	}

	if anyFailed {
		// If any rendition failed permanently, mark the whole HLS attempt as
		// failed. We do not block on still-running renditions — they may
		// succeed later, but the master is not usable without all variants.
		if _, err := w.Q.UpdateVideoHLSStatus(ctx, sqlc.UpdateVideoHLSStatusParams{
			ID:        pgID,
			HLSStatus: sqlc.HlsStatusFailed,
		}); err != nil {
			return fmt.Errorf("set hls_status=failed: %w", err)
		}
		slog.Warn("hls finalize: marked failed", "videoId", job.Args.VideoID)
		return nil
	}
	if !allReady {
		// Some renditions are still encoding. encode_variant will re-enqueue
		// us when they finish, but if two of them complete during this run
		// their EnqueueFinalize calls get deduped against this running job.
		// Schedule a delayed re-check as a safety net; if encode_variant beats
		// us to it the scheduled job is deduped (Scheduled is in our unique
		// set). We only do this while at least one rendition is still
		// progressing so a stuck-in-pending state doesn't cause infinite
		// rescheduling.
		if anyEncoding && w.Manager != nil {
			_, err := w.Manager.Client.Insert(ctx, FinalizeHLSArgs{VideoID: job.Args.VideoID}, &river.InsertOpts{
				ScheduledAt: time.Now().Add(finalizeRecheckDelay),
			})
			if err != nil {
				slog.Warn("schedule finalize recheck", "videoId", job.Args.VideoID, "error", err)
			}
		}
		return nil
	}

	masterKey := fmt.Sprintf("hls/%s/master.m3u8", job.Args.VideoID)
	master := buildMasterPlaylist(rends)
	if err := w.Storage.PutBytes(ctx, masterKey, "application/vnd.apple.mpegurl", []byte(master)); err != nil {
		return fmt.Errorf("upload master playlist: %w", err)
	}
	if _, err := w.Q.UpdateVideoHLSReady(ctx, sqlc.UpdateVideoHLSReadyParams{
		ID:           pgID,
		HlsMasterKey: masterKey,
	}); err != nil {
		return fmt.Errorf("mark hls ready: %w", err)
	}
	slog.Info("hls finalize: master playlist published", "videoId", job.Args.VideoID, "key", masterKey, "renditions", len(rends))
	return nil
}

// buildMasterPlaylist writes a master m3u8 referencing each rendition's
// variant playlist by relative path. Higher-quality streams come first so the
// adaptive player can pick down from the top.
func buildMasterPlaylist(rends []sqlc.VideoRendition) string {
	sorted := make([]sqlc.VideoRendition, len(rends))
	copy(sorted, rends)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].Height > sorted[j].Height
	})

	var b strings.Builder
	b.WriteString("#EXTM3U\n")
	b.WriteString("#EXT-X-VERSION:3\n")
	for _, r := range sorted {
		bw := int32(2_000_000)
		if r.BandwidthBps != nil && *r.BandwidthBps > 0 {
			bw = *r.BandwidthBps
		}
		fmt.Fprintf(&b, "#EXT-X-STREAM-INF:BANDWIDTH=%d,RESOLUTION=%dx%d,CODECS=\"avc1.4d401f,mp4a.40.2\"\n", bw, r.Width, r.Height)
		fmt.Fprintf(&b, "%s/playlist.m3u8\n", string(r.Kind))
	}
	return b.String()
}
