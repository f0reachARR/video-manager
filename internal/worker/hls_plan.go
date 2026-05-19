package worker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

// PlanHLSArgs is the payload for video.hls.plan jobs.
type PlanHLSArgs struct {
	VideoID string `json:"videoId"`
}

func (PlanHLSArgs) Kind() string { return "video.hls.plan" }

func (PlanHLSArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue: QueueDefault,
		UniqueOpts: river.UniqueOpts{
			ByArgs:   true,
			ByPeriod: 24 * time.Hour,
		},
	}
}

// PlanHLSWorker decides which renditions to produce for a video, creates the
// video_renditions rows, and enqueues one encode_variant job per rendition.
type PlanHLSWorker struct {
	river.WorkerDefaults[PlanHLSArgs]
	Q       *sqlc.Queries
	Manager *Manager
}

// renditionSpec describes a target rendition. Bitrates are pre-baked here so
// the encode worker doesn't need to know about codec tuning.
type renditionSpec struct {
	kind         sqlc.RenditionKind
	height       int32 // target height; width follows the source aspect
	videoBitrate string
	audioBitrate string
	bandwidthBps int32 // advertised in master playlist (video + audio)
}

var renditionsAscending = []renditionSpec{
	{kind: sqlc.RenditionKind480p, height: 480, videoBitrate: "1200k", audioBitrate: "128k", bandwidthBps: 1_400_000},
	{kind: sqlc.RenditionKind720p, height: 720, videoBitrate: "2500k", audioBitrate: "128k", bandwidthBps: 2_800_000},
}

func (w *PlanHLSWorker) Work(ctx context.Context, job *river.Job[PlanHLSArgs]) error {
	id, err := uuid.Parse(job.Args.VideoID)
	if err != nil {
		return fmt.Errorf("invalid videoId: %w", err)
	}
	pgID := pgtype.UUID{Bytes: id, Valid: true}

	v, err := w.Q.GetVideo(ctx, pgID)
	if err != nil {
		return fmt.Errorf("get video: %w", err)
	}
	if v.SourceWidth == nil || v.SourceHeight == nil {
		return errors.New("source dimensions not yet set; probe must run first")
	}

	srcH := *v.SourceHeight
	srcW := *v.SourceWidth

	specs := []renditionSpec{{
		kind:         sqlc.RenditionKindOriginal,
		height:       srcH,
		videoBitrate: "5000k",
		audioBitrate: "192k",
		bandwidthBps: estimateOriginalBandwidth(srcW, srcH),
	}}
	for _, s := range renditionsAscending {
		if srcH >= s.height {
			specs = append(specs, s)
		}
	}

	if _, err := w.Q.UpdateVideoHLSStatus(ctx, sqlc.UpdateVideoHLSStatusParams{
		ID:        pgID,
		HLSStatus: sqlc.HlsStatusEncoding,
	}); err != nil {
		return fmt.Errorf("set hls_status=encoding: %w", err)
	}

	for _, s := range specs {
		width, height := dimensionsFor(s, srcW, srcH)
		bw := s.bandwidthBps
		playlistKey := fmt.Sprintf("hls/%s/%s/playlist.m3u8", v.ID.String(), string(s.kind))

		rend, err := w.Q.InsertRendition(ctx, sqlc.InsertRenditionParams{
			VideoID:      pgID,
			Kind:         s.kind,
			Passthrough:  s.kind == sqlc.RenditionKindOriginal && v.PassthroughOk,
			Width:        width,
			Height:       height,
			BandwidthBps: &bw,
			PlaylistKey:  playlistKey,
		})
		if err != nil {
			return fmt.Errorf("insert rendition %s: %w", s.kind, err)
		}
		if err := w.Manager.EnqueueEncodeVariant(ctx, v.ID.String(), rend.ID.String()); err != nil {
			return fmt.Errorf("enqueue encode_variant %s: %w", s.kind, err)
		}
		slog.Info("hls rendition planned", "videoId", v.ID.String(), "kind", s.kind, "passthrough", rend.Passthrough, "width", width, "height", height)
	}
	return nil
}

func dimensionsFor(spec renditionSpec, srcW, srcH int32) (w, h int32) {
	if spec.kind == sqlc.RenditionKindOriginal {
		return srcW, srcH
	}
	// keep aspect ratio: width = round_even(srcW * targetH / srcH)
	if srcH == 0 {
		return srcW, spec.height
	}
	w64 := int64(srcW) * int64(spec.height) / int64(srcH)
	if w64%2 == 1 {
		w64++
	}
	return int32(w64), spec.height
}

// estimateOriginalBandwidth is a rough cap used in the master playlist
// BANDWIDTH attribute. We don't know the source's actual encoded bitrate
// without re-probing; this errs high so adaptive selection picks original
// only on fast connections.
func estimateOriginalBandwidth(w, h int32) int32 {
	pixels := int64(w) * int64(h)
	switch {
	case pixels >= 1920*1080:
		return 6_000_000
	case pixels >= 1280*720:
		return 4_000_000
	default:
		return 2_000_000
	}
}
