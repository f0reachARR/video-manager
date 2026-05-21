package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/f0reachARR/video-manager/internal/hlsrunner/ffmpeg"
	"github.com/f0reachARR/video-manager/internal/hlswire"
	"github.com/f0reachARR/video-manager/internal/storage"
)

const (
	// progressBatchEvery batches /progress notifications so we don't hammer
	// the API with one POST per segment. We flush whichever fires first.
	progressBatchEvery   = 5
	progressBatchTimeout = 3 * time.Second
)

// runEncode handles a TypeEncodeVariant job: ffmpeg HLS run with per-segment
// S3 upload. Reports progress in batches and uploads the final playlist
// before returning the /complete body.
func runEncode(ctx context.Context, api *apiClient, store *storage.Client, job *hlswire.ClaimResponse) (any, error) {
	var claim hlswire.EncodeClaim
	if err := json.Unmarshal(job.Payload, &claim); err != nil {
		return nil, fmt.Errorf("decode encode claim: %w", err)
	}
	if !ffmpeg.FFmpegAvailable() || !ffmpeg.IsAvailable() {
		return nil, errors.New("ffmpeg/ffprobe not available")
	}

	tmpDir, err := os.MkdirTemp("", "vm-hls-"+job.JobID+"-")
	if err != nil {
		return nil, fmt.Errorf("mkdtemp: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	opt := ffmpeg.HLSOptions{
		Input:       claim.SourceURL,
		OutDir:      tmpDir,
		Passthrough: claim.Passthrough,
		SegmentSec:  claim.SegmentSec,
	}
	if !claim.Passthrough {
		opt.Width = int(claim.Width)
		opt.Height = int(claim.Height)
		opt.VideoBitrate = claim.VideoBitrate
		opt.AudioBitrate = claim.AudioBitrate
	}

	// uploadMu serializes segment + playlist uploads so playlist.m3u8 is
	// always uploaded after the segments it references.
	var uploadMu sync.Mutex
	// progressMu and segmentsDone track the running count for batched reports.
	var (
		progressMu       sync.Mutex
		segmentsDone     int32
		lastReportedAt   = time.Now()
		lastReportedSegs int32
	)

	maybeReport := func() {
		progressMu.Lock()
		count := segmentsDone
		shouldReport := count-lastReportedSegs >= progressBatchEvery ||
			(count > lastReportedSegs && time.Since(lastReportedAt) >= progressBatchTimeout)
		if shouldReport {
			lastReportedSegs = count
			lastReportedAt = time.Now()
		}
		progressMu.Unlock()
		if !shouldReport {
			return
		}
		body := hlswire.EncodeProgress{
			LeaseAuth:    hlswire.LeaseAuth{LeaseToken: job.LeaseToken},
			SegmentsDone: count,
		}
		if err := api.progress(ctx, job.JobID, body); err != nil {
			slog.Warn("progress report failed", "jobId", job.JobID, "error", err)
		}
	}

	upload := func(name string) {
		uploadMu.Lock()
		defer uploadMu.Unlock()
		segKey := claim.HLSPrefix + name
		segPath := filepath.Join(tmpDir, name)
		if err := store.PutFile(ctx, segKey, "video/mp2t", segPath); err != nil {
			slog.Warn("upload segment failed", "jobId", job.JobID, "segment", name, "error", err)
			return
		}
		playlistPath := filepath.Join(tmpDir, ffmpeg.PlaylistName)
		if _, err := os.Stat(playlistPath); err == nil {
			if err := store.PutFile(ctx, claim.HLSPrefix+ffmpeg.PlaylistName,
				"application/vnd.apple.mpegurl", playlistPath); err != nil {
				slog.Warn("upload playlist failed", "jobId", job.JobID, "error", err)
			}
		}
		progressMu.Lock()
		segmentsDone++
		progressMu.Unlock()
		maybeReport()
	}

	if err := ffmpeg.RunHLS(ctx, opt, upload); err != nil {
		return nil, fmt.Errorf("ffmpeg hls: %w", err)
	}

	// Final playlist upload — ffmpeg writes #EXT-X-ENDLIST on success, and the
	// last segment notification may have raced with the rewrite.
	uploadMu.Lock()
	finalPlaylist := filepath.Join(tmpDir, ffmpeg.PlaylistName)
	if err := store.PutFile(ctx, claim.HLSPrefix+ffmpeg.PlaylistName,
		"application/vnd.apple.mpegurl", finalPlaylist); err != nil {
		uploadMu.Unlock()
		return nil, fmt.Errorf("upload final playlist: %w", err)
	}
	uploadMu.Unlock()

	// Send a final progress update so the API has the exact count, then return.
	progressMu.Lock()
	finalCount := segmentsDone
	pending := finalCount > lastReportedSegs
	if pending {
		lastReportedSegs = finalCount
	}
	progressMu.Unlock()
	if pending {
		body := hlswire.EncodeProgress{
			LeaseAuth:    hlswire.LeaseAuth{LeaseToken: job.LeaseToken},
			SegmentsDone: finalCount,
		}
		if err := api.progress(ctx, job.JobID, body); err != nil {
			slog.Warn("final progress report failed", "jobId", job.JobID, "error", err)
		}
	}

	return hlswire.EncodeComplete{LeaseAuth: hlswire.LeaseAuth{LeaseToken: job.LeaseToken}}, nil
}
