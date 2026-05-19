package worker

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
	"github.com/f0reachARR/video-manager/internal/storage"
)

// FinalizeHLSArgs is the payload for video.hls.finalize jobs.
type FinalizeHLSArgs struct {
	VideoID string `json:"videoId"`
}

func (FinalizeHLSArgs) Kind() string { return "video.hls.finalize" }

func (FinalizeHLSArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue: QueueDefault,
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
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
}

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
	allReady := true
	for _, r := range rends {
		if r.Status == sqlc.RenditionStatusFailed {
			anyFailed = true
		}
		if r.Status != sqlc.RenditionStatusReady {
			allReady = false
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
		// Still encoding — exit, encode_variant will re-enqueue when done.
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
