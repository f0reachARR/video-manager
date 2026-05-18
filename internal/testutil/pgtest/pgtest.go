// Package pgtest sets up the shared Postgres test database used by integration
// tests. The dev `docker compose` Postgres is reused with a dedicated database
// (default: video_manager_test). On the first call per process the public
// schema is dropped, recreated, and all migrations under `migrations/` are
// applied. Each subsequent Setup truncates all user tables so tests stay
// isolated without paying the migration cost again.
package pgtest

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const defaultURL = "postgres://video:video@localhost:5432/video_manager_test?sslmode=disable"

var (
	bootstrapOnce sync.Once
	bootstrapErr  error
	sharedPool    *pgxpool.Pool
)

// DatabaseURL returns the connection string used by tests.
func DatabaseURL() string {
	if v := os.Getenv("TEST_DATABASE_URL"); v != "" {
		return v
	}
	return defaultURL
}

// Setup returns a process-shared pool against the test database. It runs
// migrations once per process and truncates all user tables before returning.
// If the database is unreachable the calling test is skipped.
func Setup(t *testing.T) *pgxpool.Pool {
	t.Helper()
	bootstrapOnce.Do(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		bootstrapErr = bootstrap(ctx)
	})
	if bootstrapErr != nil {
		t.Skipf("test database unavailable (set TEST_DATABASE_URL or run ./scripts/test.sh): %v", bootstrapErr)
	}
	if err := truncate(context.Background(), sharedPool); err != nil {
		t.Fatalf("pgtest truncate: %v", err)
	}
	return sharedPool
}

func bootstrap(ctx context.Context) error {
	pool, err := pgxpool.New(ctx, DatabaseURL())
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return fmt.Errorf("ping: %w", err)
	}
	if err := resetSchema(ctx, pool); err != nil {
		pool.Close()
		return err
	}
	if err := applyMigrations(ctx, pool); err != nil {
		pool.Close()
		return err
	}
	sharedPool = pool
	return nil
}

func resetSchema(ctx context.Context, pool *pgxpool.Pool) error {
	stmts := []string{
		`DROP SCHEMA IF EXISTS public CASCADE`,
		`CREATE SCHEMA public`,
		`GRANT ALL ON SCHEMA public TO PUBLIC`,
		`CREATE EXTENSION IF NOT EXISTS pgcrypto`,
		`CREATE EXTENSION IF NOT EXISTS pg_trgm`,
	}
	for _, s := range stmts {
		if _, err := pool.Exec(ctx, s); err != nil {
			return fmt.Errorf("%s: %w", s, err)
		}
	}
	return nil
}

func applyMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	dir, err := migrationsDir()
	if err != nil {
		return err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("readdir %s: %w", dir, err)
	}
	files := []string{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".up.sql") {
			continue
		}
		files = append(files, e.Name())
	}
	sort.Strings(files)
	for _, f := range files {
		data, err := os.ReadFile(filepath.Join(dir, f))
		if err != nil {
			return fmt.Errorf("read %s: %w", f, err)
		}
		if _, err := pool.Exec(ctx, string(data)); err != nil {
			return fmt.Errorf("apply %s: %w", f, err)
		}
	}
	return nil
}

func migrationsDir() (string, error) {
	root, err := projectRoot()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, "migrations"), nil
}

func projectRoot() (string, error) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return "", errors.New("runtime.Caller failed")
	}
	dir := filepath.Dir(file)
	for i := 0; i < 8; i++ {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", errors.New("project root (go.mod) not found")
}

func truncate(ctx context.Context, pool *pgxpool.Pool) error {
	const q = `
		SELECT string_agg(format('%I', tablename), ', ')
		FROM pg_tables
		WHERE schemaname = 'public'
	`
	var list *string
	if err := pool.QueryRow(ctx, q).Scan(&list); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("list tables: %w", err)
	}
	if list == nil || *list == "" {
		return nil
	}
	if _, err := pool.Exec(ctx, "TRUNCATE TABLE "+*list+" RESTART IDENTITY CASCADE"); err != nil {
		return fmt.Errorf("truncate: %w", err)
	}
	return nil
}
