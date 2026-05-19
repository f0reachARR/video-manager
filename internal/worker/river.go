package worker

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
	"github.com/f0reachARR/video-manager/internal/storage"
)

// Config controls which queues this process polls and at what concurrency.
// Other nodes can join the same Postgres queue with a different config to
// spread load (e.g. a dedicated worker node polls only "encode").
type Config struct {
	Queues             []string // queues this process polls; defaults to ["default"]
	DefaultConcurrency int      // workers for the "default" queue
	EncodeConcurrency  int      // workers for the "encode" queue (heavy ffmpeg)
}

// Queue names. Probe / plan / finalize are cheap and stay on the default
// queue; encode_variant is the long-running ffmpeg job and runs on its own
// queue so worker nodes can opt in.
const (
	QueueDefault = "default"
	QueueEncode  = "encode"
)

// Manager wraps the river client and exposes Insert helpers used by the API
// and by other workers.
type Manager struct {
	Client *river.Client[pgx.Tx]
}

// Setup runs River's schema migrations and constructs a Client with all
// video.* workers registered. The returned Manager is not started yet; call
// Start to begin processing jobs.
func Setup(ctx context.Context, pool *pgxpool.Pool, q *sqlc.Queries, store *storage.Client, cfg Config) (*Manager, error) {
	driver := riverpgxv5.New(pool)

	migrator, err := rivermigrate.New(driver, nil)
	if err != nil {
		return nil, fmt.Errorf("rivermigrate.New: %w", err)
	}
	if _, err := migrator.Migrate(ctx, rivermigrate.DirectionUp, nil); err != nil {
		return nil, fmt.Errorf("rivermigrate up: %w", err)
	}

	if cfg.DefaultConcurrency <= 0 {
		cfg.DefaultConcurrency = 4
	}
	if cfg.EncodeConcurrency <= 0 {
		cfg.EncodeConcurrency = 1
	}
	if len(cfg.Queues) == 0 {
		cfg.Queues = []string{QueueDefault}
	}

	mgr := &Manager{}
	workers := river.NewWorkers()
	river.AddWorker(workers, &ProbeVideoWorker{Q: q, Storage: store, Manager: mgr})
	river.AddWorker(workers, &PlanHLSWorker{Q: q, Manager: mgr})
	river.AddWorker(workers, &EncodeVariantWorker{Q: q, Storage: store, Manager: mgr})
	river.AddWorker(workers, &FinalizeHLSWorker{Q: q, Storage: store})

	queues := map[string]river.QueueConfig{}
	for _, name := range cfg.Queues {
		switch name {
		case QueueDefault:
			queues[QueueDefault] = river.QueueConfig{MaxWorkers: cfg.DefaultConcurrency}
		case QueueEncode:
			queues[QueueEncode] = river.QueueConfig{MaxWorkers: cfg.EncodeConcurrency}
		default:
			return nil, fmt.Errorf("unknown worker queue %q", name)
		}
	}

	client, err := river.NewClient(driver, &river.Config{
		Queues:  queues,
		Workers: workers,
	})
	if err != nil {
		return nil, fmt.Errorf("river.NewClient: %w", err)
	}

	mgr.Client = client
	return mgr, nil
}

func (m *Manager) Start(ctx context.Context) error { return m.Client.Start(ctx) }

func (m *Manager) Stop(ctx context.Context) error { return m.Client.Stop(ctx) }

// EnqueueProbe inserts a video.probe job for the given video id.
func (m *Manager) EnqueueProbe(ctx context.Context, videoID string) error {
	_, err := m.Client.Insert(ctx, ProbeVideoArgs{VideoID: videoID}, nil)
	return err
}

// EnqueuePlanHLS inserts a video.hls.plan job for the given video id.
func (m *Manager) EnqueuePlanHLS(ctx context.Context, videoID string) error {
	_, err := m.Client.Insert(ctx, PlanHLSArgs{VideoID: videoID}, nil)
	return err
}

// EnqueueEncodeVariant inserts a video.hls.encode_variant job for the given
// rendition.
func (m *Manager) EnqueueEncodeVariant(ctx context.Context, videoID, renditionID string) error {
	_, err := m.Client.Insert(ctx, EncodeVariantArgs{VideoID: videoID, RenditionID: renditionID}, nil)
	return err
}

// EnqueueFinalize inserts a video.hls.finalize job for the given video. It
// is safe to call many times; the job is unique by VideoID.
func (m *Manager) EnqueueFinalize(ctx context.Context, videoID string) error {
	_, err := m.Client.Insert(ctx, FinalizeHLSArgs{VideoID: videoID}, nil)
	return err
}
