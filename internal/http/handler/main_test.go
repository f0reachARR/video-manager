package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
	"github.com/f0reachARR/video-manager/internal/http/handler"
	appmid "github.com/f0reachARR/video-manager/internal/http/middleware"
	"github.com/f0reachARR/video-manager/internal/http/route"
	"github.com/f0reachARR/video-manager/internal/testutil/pgtest"
)

type pingerFunc func(ctx context.Context) error

func (f pingerFunc) Ping(ctx context.Context) error { return f(ctx) }

type stubEnqueuer struct{ calls []string }

func (s *stubEnqueuer) EnqueueProbe(_ context.Context, videoID string) error {
	s.calls = append(s.calls, videoID)
	return nil
}

type testEnv struct {
	Pool     *pgxpool.Pool
	Q        *sqlc.Queries
	Router   http.Handler
	Enqueuer *stubEnqueuer
	// DefaultUserID is injected as X-User-Id on every do() request so tests
	// satisfy RequireAuth without each having to seed a user themselves.
	DefaultUserID string
}

func setupEnv(t *testing.T) *testEnv {
	t.Helper()
	pool := pgtest.Setup(t)
	q := sqlc.New(pool)
	enq := &stubEnqueuer{}
	r := route.New(route.Deps{
		Health:    &handler.Health{Version: "test", DB: pingerFunc(pool.Ping)},
		Users:     &handler.Users{Q: q},
		Devices:   &handler.Devices{Q: q},
		Teams:     &handler.Teams{Q: q},
		Robots:    &handler.Robots{Q: q},
		Scenarios: &handler.Scenarios{Q: q},
		Tags:      &handler.Tags{Q: q},
		Sessions:  &handler.Sessions{Q: q},
		Runs:      &handler.Runs{Q: q},
		Markers:     &handler.Markers{Q: q},
		Tournaments: &handler.Tournaments{Q: q, Pool: pool},
		BulkUploads: &handler.BulkUploads{Q: q},
		Matches:     &handler.Matches{Q: q},
		Annotations:   &handler.Annotations{Q: q},
		ScoutingNotes: &handler.ScoutingNotes{Q: q},
		// Videos handler depends on a Storage client; not exercised in these tests.
		Videos:  &handler.Videos{Q: q},
		Uploads: &handler.Uploads{Q: q, Worker: enq, BulkUploads: &handler.BulkUploads{Q: q}},
		// Tests still author via X-User-Id, so enable the dev-bypass path in
		// the auth middleware. No session signer needed here — the bypass
		// branch reads the header directly.
		AuthMiddleware: appmid.AuthDeps{Q: q, DevBypass: true},
	})
	u, err := q.CreateUser(context.Background(), sqlc.CreateUserParams{Name: "test-default"})
	if err != nil {
		t.Fatalf("seed default user: %v", err)
	}
	var idStr string
	if err := pool.QueryRow(context.Background(), `SELECT $1::uuid::text`, u.ID).Scan(&idStr); err != nil {
		t.Fatalf("format default user id: %v", err)
	}
	return &testEnv{Pool: pool, Q: q, Router: r, Enqueuer: enq, DefaultUserID: idStr}
}

// do executes a request against the test router and decodes the JSON body into
// out (if non-nil). It returns the recorder for status/headers assertions.
func (e *testEnv) do(t *testing.T, method, path string, in any, out any) *httptest.ResponseRecorder {
	return e.doWithHeaders(t, method, path, in, out, nil)
}

func (e *testEnv) doWithHeaders(t *testing.T, method, path string, in any, out any, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var body io.Reader
	if in != nil {
		raw, err := json.Marshal(in)
		if err != nil {
			t.Fatalf("marshal request: %v", err)
		}
		body = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, path, body)
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if e.DefaultUserID != "" {
		req.Header.Set("X-User-Id", e.DefaultUserID)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	e.Router.ServeHTTP(rec, req)
	if out != nil && rec.Body.Len() > 0 && rec.Code != http.StatusNoContent {
		if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
			t.Fatalf("decode response (%s %s, status=%d): %v\nbody=%s", method, path, rec.Code, err, rec.Body.String())
		}
	}
	return rec
}

func mustStatus(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("status: got %d want %d, body=%s", rec.Code, want, rec.Body.String())
	}
}

// createTournament inserts a tournament row directly via sqlc and returns its
// ID. Used by tests that don't actually care about the tournament's identity
// — they just need a valid id to satisfy the new FK on videos/runs/sessions.
func (e *testEnv) createTournament(t *testing.T, name string) string {
	t.Helper()
	tn, err := e.Q.CreateTournament(t.Context(), sqlc.CreateTournamentParams{Name: name})
	if err != nil {
		t.Fatalf("seed tournament: %v", err)
	}
	var idStr string
	if err := e.Pool.QueryRow(t.Context(), `SELECT $1::uuid::text`, tn.ID).Scan(&idStr); err != nil {
		t.Fatalf("format tournament id: %v", err)
	}
	return idStr
}
