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

// Manager wraps the river client and exposes Insert helpers used by the API.
type Manager struct {
	Client *river.Client[pgx.Tx]
}

// Setup runs River's schema migrations and constructs a Client with the
// video.probe worker registered. The returned Manager is not started yet; call
// Start to begin processing jobs.
func Setup(ctx context.Context, pool *pgxpool.Pool, q *sqlc.Queries, store *storage.Client) (*Manager, error) {
	driver := riverpgxv5.New(pool)

	migrator, err := rivermigrate.New(driver, nil)
	if err != nil {
		return nil, fmt.Errorf("rivermigrate.New: %w", err)
	}
	if _, err := migrator.Migrate(ctx, rivermigrate.DirectionUp, nil); err != nil {
		return nil, fmt.Errorf("rivermigrate up: %w", err)
	}

	workers := river.NewWorkers()
	river.AddWorker(workers, &ProbeVideoWorker{Q: q, Storage: store})

	client, err := river.NewClient(driver, &river.Config{
		Queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: 4},
		},
		Workers: workers,
	})
	if err != nil {
		return nil, fmt.Errorf("river.NewClient: %w", err)
	}

	return &Manager{Client: client}, nil
}

func (m *Manager) Start(ctx context.Context) error { return m.Client.Start(ctx) }

func (m *Manager) Stop(ctx context.Context) error { return m.Client.Stop(ctx) }

// EnqueueProbe inserts a video.probe job for the given video id.
func (m *Manager) EnqueueProbe(ctx context.Context, videoID string) error {
	_, err := m.Client.Insert(ctx, ProbeVideoArgs{VideoID: videoID}, nil)
	return err
}
