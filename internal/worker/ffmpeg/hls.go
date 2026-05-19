package ffmpeg

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/fsnotify/fsnotify"
)

// HLSOptions configures a single ffmpeg HLS run. Either Passthrough (-c copy)
// or a re-encode at the given Width/Height is performed; segments are written
// to OutDir and the m3u8 is updated incrementally.
type HLSOptions struct {
	Input        string // source URL or local path
	OutDir       string // local tmp directory; ffmpeg writes seg-NNNNN.ts and playlist.m3u8 here
	Passthrough  bool   // true => -c copy, false => libx264 + AAC
	Width        int    // re-encode target width (used only when !Passthrough); 0 means scale by height
	Height       int    // re-encode target height (used only when !Passthrough)
	VideoBitrate string // e.g. "2500k" — required when !Passthrough
	AudioBitrate string // e.g. "128k"  — required when !Passthrough
	SegmentSec   int    // hls_time; default 6
}

// PlaylistName is the m3u8 file ffmpeg writes inside OutDir.
const PlaylistName = "playlist.m3u8"

// SegmentPrefix is the segment filename prefix; segments are seg-00000.ts etc.
const SegmentPrefix = "seg-"

// RunHLS launches ffmpeg with HLS muxing options and watches OutDir for newly
// finalized segments. Each segment basename is passed to onSegment (best-effort;
// the caller decides whether to upload to S3). The function blocks until ffmpeg
// exits or ctx is cancelled.
func RunHLS(ctx context.Context, opt HLSOptions, onSegment func(name string)) error {
	if opt.OutDir == "" {
		return errors.New("hls: OutDir required")
	}
	if opt.SegmentSec == 0 {
		opt.SegmentSec = 6
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("fsnotify new: %w", err)
	}
	defer watcher.Close()
	if err := watcher.Add(opt.OutDir); err != nil {
		return fmt.Errorf("fsnotify add: %w", err)
	}

	watchCtx, cancelWatch := context.WithCancel(ctx)
	defer cancelWatch()

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		watchSegments(watchCtx, watcher, onSegment)
	}()

	args := buildArgs(opt)
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)

	var stderr bytes.Buffer
	cmd.Stderr = &stderrTee{w: &stderr}
	cmd.Stdout = io.Discard
	slog.Info("starting ffmpeg HLS run", "args", strings.Join(args, " "))
	if err := cmd.Run(); err != nil {
		cancelWatch()
		wg.Wait()
		return fmt.Errorf("ffmpeg hls: %w (stderr=%q)", err, tail(stderr.String(), 4096))
	}
	cancelWatch()
	wg.Wait()
	return nil
}

func buildArgs(opt HLSOptions) []string {
	args := []string{
		"-y",
		"-i", opt.Input,
	}
	if opt.Passthrough {
		args = append(args, "-c", "copy")
	} else {
		vf := ""
		switch {
		case opt.Width > 0 && opt.Height > 0:
			vf = fmt.Sprintf("scale=%d:%d", opt.Width, opt.Height)
		case opt.Height > 0:
			vf = fmt.Sprintf("scale=-2:%d", opt.Height)
		case opt.Width > 0:
			vf = fmt.Sprintf("scale=%d:-2", opt.Width)
		}
		if vf != "" {
			args = append(args, "-vf", vf)
		}
		args = append(args,
			"-c:v", "libx264",
			"-preset", "veryfast",
			"-profile:v", "main",
			"-level", "4.0",
			"-pix_fmt", "yuv420p",
			"-b:v", opt.VideoBitrate,
			"-maxrate", opt.VideoBitrate,
			"-bufsize", doubleBitrate(opt.VideoBitrate),
			"-g", strconv.Itoa(opt.SegmentSec*30),
			"-keyint_min", strconv.Itoa(opt.SegmentSec*30),
			"-sc_threshold", "0",
			"-c:a", "aac",
			"-b:a", opt.AudioBitrate,
			"-ac", "2",
		)
	}
	args = append(args,
		"-f", "hls",
		"-hls_time", strconv.Itoa(opt.SegmentSec),
		"-hls_list_size", "0",
		"-hls_flags", "independent_segments+program_date_time+temp_file",
		"-hls_segment_type", "mpegts",
		"-hls_segment_filename", filepath.Join(opt.OutDir, SegmentPrefix+"%05d.ts"),
		filepath.Join(opt.OutDir, PlaylistName),
	)
	return args
}

// watchSegments fires onSegment for each finalized .ts file. ffmpeg with
// `-hls_flags temp_file` writes seg-XXXXX.ts.tmp first, then renames to
// seg-XXXXX.ts on completion, so fsnotify.Rename / Create on the final name
// is our completion signal.
func watchSegments(ctx context.Context, watcher *fsnotify.Watcher, onSegment func(name string)) {
	emitted := map[string]struct{}{}
	emit := func(path string) {
		name := filepath.Base(path)
		if !strings.HasPrefix(name, SegmentPrefix) || !strings.HasSuffix(name, ".ts") {
			return
		}
		if _, ok := emitted[name]; ok {
			return
		}
		emitted[name] = struct{}{}
		if onSegment != nil {
			onSegment(name)
		}
	}
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-watcher.Events:
			if !ok {
				return
			}
			// On macOS/Linux, fsnotify reports Rename for old name and Create
			// for new name after rename. Either of Create/Write/Rename on the
			// final name means it exists and is closed.
			if ev.Op&(fsnotify.Create|fsnotify.Rename|fsnotify.Write) != 0 {
				emit(ev.Name)
			}
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			slog.Warn("fsnotify watcher error", "error", err)
		}
	}
}

// doubleBitrate parses a bitrate spec like "2500k" or "3M" and returns the
// same scale with the numeric value doubled (used for VBV bufsize).
func doubleBitrate(s string) string {
	if s == "" {
		return "5000k"
	}
	suffix := ""
	num := s
	if last := s[len(s)-1]; last < '0' || last > '9' {
		suffix = string(last)
		num = s[:len(s)-1]
	}
	n, err := strconv.Atoi(num)
	if err != nil {
		return s
	}
	return strconv.Itoa(n*2) + suffix
}

type stderrTee struct {
	w *bytes.Buffer
}

func (t *stderrTee) Write(p []byte) (int, error) {
	// ffmpeg prints copious progress to stderr; keep only the tail so errors
	// are still useful but we don't blow memory on long encodes.
	const maxKeep = 8 * 1024
	if t.w.Len()+len(p) > maxKeep {
		drop := t.w.Len() + len(p) - maxKeep
		if drop > t.w.Len() {
			drop = t.w.Len()
		}
		t.w.Next(drop)
	}
	return t.w.Write(p)
}

func tail(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[len(s)-n:]
}
