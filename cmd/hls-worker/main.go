// Command hls-worker is the external worker that performs the ffmpeg
// portion of the video pipeline. It connects only to the API (via HTTP) and
// to the object store (via S3) — it does NOT need database credentials.
//
// At startup it long-polls /internal/worker/jobs/claim, runs ffmpeg/ffprobe
// for the claimed job, uploads segments / thumbnails to S3 directly, then
// reports completion back to the API.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"

	"github.com/f0reachARR/soiree/internal/hlswire"
	"github.com/f0reachARR/soiree/internal/storage"
)

type config struct {
	APIBaseURL      string        `env:"API_BASE_URL,required"`
	WorkerAuthToken string        `env:"WORKER_AUTH_TOKEN,required"`
	WorkerID        string        `env:"WORKER_ID" envDefault:""`
	Queues          []string      `env:"WORKER_QUEUES" envDefault:"probe,encode" envSeparator:","`
	Concurrency     int           `env:"WORKER_CONCURRENCY" envDefault:"1"`
	ClaimWait       time.Duration `env:"WORKER_CLAIM_WAIT" envDefault:"25s"`
	HeartbeatEvery  time.Duration `env:"WORKER_HEARTBEAT_INTERVAL" envDefault:"30s"`
	HTTPAddr        string        `env:"WORKER_HTTP_ADDR" envDefault:""` // optional health endpoint

	S3Endpoint     string `env:"S3_ENDPOINT,required"`
	S3Region       string `env:"S3_REGION" envDefault:"us-east-1"`
	S3Bucket       string `env:"S3_BUCKET,required"`
	S3AccessKey    string `env:"S3_ACCESS_KEY,required"`
	S3SecretKey    string `env:"S3_SECRET_KEY,required"`
	S3UsePathStyle bool   `env:"S3_USE_PATH_STYLE" envDefault:"true"`
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	queuesFlag := flag.String("queues", "", "comma-separated queue list (overrides WORKER_QUEUES)")
	concurrency := flag.Int("concurrency", 0, "parallel workers (overrides WORKER_CONCURRENCY)")
	flag.Parse()

	if err := run(*queuesFlag, *concurrency); err != nil {
		logger.Error("hls-worker terminated", "error", err)
		os.Exit(1)
	}
}

func run(queuesFlag string, concurrencyFlag int) error {
	_ = godotenv.Load()

	cfg := config{}
	if err := env.Parse(&cfg); err != nil {
		return fmt.Errorf("parse env: %w", err)
	}
	if queuesFlag != "" {
		cfg.Queues = splitCSV(queuesFlag)
	}
	if concurrencyFlag > 0 {
		cfg.Concurrency = concurrencyFlag
	}
	if cfg.Concurrency <= 0 {
		cfg.Concurrency = 1
	}
	if cfg.WorkerID == "" {
		host, _ := os.Hostname()
		cfg.WorkerID = fmt.Sprintf("%s-%d", host, os.Getpid())
	}
	cfg.APIBaseURL = strings.TrimRight(cfg.APIBaseURL, "/")

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	store, err := storage.New(ctx, storage.Config{
		Endpoint:     cfg.S3Endpoint,
		Region:       cfg.S3Region,
		Bucket:       cfg.S3Bucket,
		AccessKey:    cfg.S3AccessKey,
		SecretKey:    cfg.S3SecretKey,
		UsePathStyle: cfg.S3UsePathStyle,
	})
	if err != nil {
		return fmt.Errorf("storage init: %w", err)
	}

	api := newAPIClient(cfg.APIBaseURL, cfg.WorkerAuthToken)

	slog.Info("hls-worker starting",
		"workerId", cfg.WorkerID,
		"queues", cfg.Queues,
		"concurrency", cfg.Concurrency,
		"api", cfg.APIBaseURL,
		"bucket", cfg.S3Bucket)

	var wg sync.WaitGroup
	for i := 0; i < cfg.Concurrency; i++ {
		wg.Add(1)
		slot := fmt.Sprintf("%s/%d", cfg.WorkerID, i)
		go func() {
			defer wg.Done()
			runSlot(ctx, slot, cfg, api, store)
		}()
	}

	wg.Wait()
	slog.Info("hls-worker stopped")
	return nil
}

// runSlot is one polling loop. Each slot processes one job at a time; the
// caller spins up N slots for concurrency.
func runSlot(ctx context.Context, slotID string, cfg config, api *apiClient, store *storage.Client) {
	for ctx.Err() == nil {
		req := hlswire.ClaimRequest{
			WorkerID: slotID,
			Queues:   cfg.Queues,
			WaitMs:   int(cfg.ClaimWait / time.Millisecond),
		}
		job, err := api.claim(ctx, req)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return
			}
			slog.Warn("claim error; backing off", "slot", slotID, "error", err)
			sleep(ctx, 3*time.Second)
			continue
		}
		if job == nil {
			continue // 204 — long-poll expired; immediate retry
		}
		processJob(ctx, slotID, cfg, api, store, job)
	}
}

func processJob(ctx context.Context, slotID string, cfg config, api *apiClient, store *storage.Client, job *hlswire.ClaimResponse) {
	slog.Info("job claimed", "slot", slotID, "jobId", job.JobID, "type", job.Type)

	jobCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	// Heartbeat in the background until the job is done or its context is
	// cancelled.
	hbDone := make(chan struct{})
	go func() {
		defer close(hbDone)
		runHeartbeat(jobCtx, api, job.JobID, job.LeaseToken, cfg.HeartbeatEvery)
	}()

	var (
		complete any
		runErr   error
	)
	switch job.Type {
	case hlswire.TypeProbe:
		complete, runErr = runProbe(jobCtx, api, store, job)
	case hlswire.TypeEncodeVariant:
		complete, runErr = runEncode(jobCtx, api, store, job)
	default:
		runErr = fmt.Errorf("unknown job type %q", job.Type)
	}

	cancel()
	<-hbDone

	if runErr != nil {
		// Best-effort fail report; if the API is unreachable the lease will
		// expire on its own.
		if err := api.fail(context.Background(), job.JobID, job.LeaseToken, runErr.Error()); err != nil {
			slog.Warn("fail report failed", "jobId", job.JobID, "error", err)
		}
		slog.Warn("job failed", "slot", slotID, "jobId", job.JobID, "error", runErr)
		return
	}
	if err := api.complete(context.Background(), job.JobID, complete); err != nil {
		slog.Warn("complete report failed", "jobId", job.JobID, "error", err)
		return
	}
	slog.Info("job complete", "slot", slotID, "jobId", job.JobID)
}

func runHeartbeat(ctx context.Context, api *apiClient, jobID, token string, every time.Duration) {
	if every <= 0 {
		every = 30 * time.Second
	}
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := api.heartbeat(ctx, jobID, token); err != nil {
				slog.Warn("heartbeat failed", "jobId", jobID, "error", err)
				// keep trying — the lease watchdog will fail the job if we
				// drop below the grace window.
			}
		}
	}
}

func splitCSV(s string) []string {
	out := []string{}
	for _, p := range strings.Split(s, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func sleep(ctx context.Context, d time.Duration) {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
	case <-t.C:
	}
}
