package handler_test

import (
	"net/http"
	"testing"
	"time"
)

type sessionResp struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	StartedAt *time.Time `json:"startedAt"`
	EndedAt   *time.Time `json:"endedAt"`
	Location  *string    `json:"location"`
	ModeHint  string     `json:"modeHint"`
}

type sessionCandidateResp struct {
	Type    string       `json:"type"`
	Session *sessionResp `json:"session,omitempty"`
	GapSec  *int32       `json:"gapSec"`
}

type sessionCandidateListResp struct {
	Data []sessionCandidateResp `json:"data"`
}

func mustTime(t *testing.T, s string) time.Time {
	t.Helper()
	v, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatalf("parse time %q: %v", s, err)
	}
	return v
}

func TestSessionsPatchClearsLocation(t *testing.T) {
	env := setupEnv(t)
	tournamentID := env.createTournament(t, "T1")
	var s sessionResp
	rec := env.do(t, http.MethodPost, "/sessions",
		map[string]any{"name": "S1", "modeHint": "practice", "location": "Gym A", "tournamentId": tournamentID}, &s)
	mustStatus(t, rec, http.StatusCreated)
	if s.Location == nil || *s.Location != "Gym A" {
		t.Fatalf("create did not set location: %+v", s)
	}

	var patched sessionResp
	rec = env.do(t, http.MethodPatch, "/sessions/"+s.ID,
		map[string]any{"location": nil}, &patched)
	mustStatus(t, rec, http.StatusOK)
	if patched.Location != nil {
		t.Errorf("location should be cleared, got %v", *patched.Location)
	}
}

func TestSessionsCandidatesOverlapAndGap(t *testing.T) {
	env := setupEnv(t)
	tournamentID := env.createTournament(t, "T1")

	// Seed scaffolding required to produce a Video with recorded_at set.
	// We bypass tus + ffprobe by inserting a Video row directly via the DB.
	ctx := t.Context()
	storageKey := "test-key-candidates"
	rows, err := env.Pool.Exec(ctx, `
		INSERT INTO videos (storage_key, tournament_id, recorded_at, duration_sec)
		VALUES ($1, $2::uuid, '2026-05-01T10:30:00Z'::timestamptz, 60)
	`, storageKey, tournamentID)
	if err != nil {
		t.Fatalf("insert video: %v", err)
	}
	if rows.RowsAffected() != 1 {
		t.Fatalf("video insert affected %d rows", rows.RowsAffected())
	}
	var videoID string
	if err := env.Pool.QueryRow(ctx,
		`SELECT id FROM videos WHERE storage_key = $1`, storageKey).Scan(&videoID); err != nil {
		t.Fatalf("select video id: %v", err)
	}

	// Three sessions: overlap, 20-minute gap, 2-hour gap (far).
	create := func(name, start, end string) string {
		var s sessionResp
		rec := env.do(t, http.MethodPost, "/sessions", map[string]any{
			"name":         name,
			"modeHint":     "practice",
			"startedAt":    start,
			"endedAt":      end,
			"tournamentId": tournamentID,
		}, &s)
		mustStatus(t, rec, http.StatusCreated)
		return s.ID
	}
	overlap := create("Overlap", "2026-05-01T10:00:00Z", "2026-05-01T11:00:00Z")
	adjacent := create("Adjacent20", "2026-05-01T10:51:00Z", "2026-05-01T11:30:00Z")
	create("Far2h", "2026-05-01T13:00:00Z", "2026-05-01T14:00:00Z")

	var list sessionCandidateListResp
	rec := env.do(t, http.MethodGet, "/sessions/candidates?videoId="+videoID, nil, &list)
	mustStatus(t, rec, http.StatusOK)

	// We expect: overlap (gap=0), adjacent (gap≈20min) and a final "new".
	if len(list.Data) != 3 {
		t.Fatalf("expected 3 candidates, got %d: %+v", len(list.Data), list)
	}
	if list.Data[0].Type != "existing" || list.Data[0].Session == nil || list.Data[0].Session.ID != overlap {
		t.Errorf("first candidate should be overlap, got %+v", list.Data[0])
	}
	if list.Data[0].GapSec == nil || *list.Data[0].GapSec != 0 {
		t.Errorf("overlap gap should be 0, got %v", list.Data[0].GapSec)
	}
	if list.Data[1].Session == nil || list.Data[1].Session.ID != adjacent {
		t.Errorf("second candidate should be adjacent, got %+v", list.Data[1])
	}
	if list.Data[1].GapSec == nil || *list.Data[1].GapSec < 19*60 || *list.Data[1].GapSec > 21*60 {
		t.Errorf("adjacent gap should be ~20min, got %v", list.Data[1].GapSec)
	}
	if list.Data[2].Type != "new" {
		t.Errorf("last candidate should be type=new, got %+v", list.Data[2])
	}
}

// Regression test: a Session created without ended_at (the typical
// "morning, leave it open for the day" case) used to be treated as a zero
// duration moment, so any video taken more than 30 minutes after started_at
// fell outside the gap threshold and was hidden from the link-later UI.
func TestSessionsCandidatesIncludesOpenEndedSession(t *testing.T) {
	env := setupEnv(t)
	tournamentID := env.createTournament(t, "T1")
	ctx := t.Context()

	storageKey := "test-key-open-ended"
	if _, err := env.Pool.Exec(ctx, `
		INSERT INTO videos (storage_key, tournament_id, recorded_at, duration_sec)
		VALUES ($1, $2::uuid, '2026-05-01T14:00:00Z'::timestamptz, 60)
	`, storageKey, tournamentID); err != nil {
		t.Fatalf("insert video: %v", err)
	}
	var videoID string
	if err := env.Pool.QueryRow(ctx,
		`SELECT id FROM videos WHERE storage_key = $1`, storageKey).Scan(&videoID); err != nil {
		t.Fatalf("select video id: %v", err)
	}

	// Session started 4 hours before the video, ended_at omitted entirely.
	var sess sessionResp
	rec := env.do(t, http.MethodPost, "/sessions", map[string]any{
		"name":         "Morning practice",
		"modeHint":     "practice",
		"startedAt":    "2026-05-01T10:00:00Z",
		"tournamentId": tournamentID,
	}, &sess)
	mustStatus(t, rec, http.StatusCreated)

	var list sessionCandidateListResp
	rec = env.do(t, http.MethodGet, "/sessions/candidates?videoId="+videoID, nil, &list)
	mustStatus(t, rec, http.StatusOK)

	if len(list.Data) != 2 {
		t.Fatalf("expected 2 candidates (existing + new), got %d: %+v", len(list.Data), list)
	}
	if list.Data[0].Type != "existing" || list.Data[0].Session == nil || list.Data[0].Session.ID != sess.ID {
		t.Errorf("expected open-ended session as first candidate, got %+v", list.Data[0])
	}
	if list.Data[0].GapSec == nil || *list.Data[0].GapSec != 0 {
		t.Errorf("open-ended session should have gap=0, got %v", list.Data[0].GapSec)
	}
}

// Regression test: a Session whose interval contains the video must appear
// as a candidate even when its started_at is well outside the previous ±24h
// fetch window. Example: a long-running "tournament weekend" session started
// 3 days ago and not yet closed.
func TestSessionsCandidatesIncludesContainingSessionFromLongAgo(t *testing.T) {
	env := setupEnv(t)
	tournamentID := env.createTournament(t, "T1")
	ctx := t.Context()

	storageKey := "test-key-old-containing"
	if _, err := env.Pool.Exec(ctx, `
		INSERT INTO videos (storage_key, tournament_id, recorded_at, duration_sec)
		VALUES ($1, $2::uuid, '2026-05-04T14:00:00Z'::timestamptz, 60)
	`, storageKey, tournamentID); err != nil {
		t.Fatalf("insert video: %v", err)
	}
	var videoID string
	if err := env.Pool.QueryRow(ctx,
		`SELECT id FROM videos WHERE storage_key = $1`, storageKey).Scan(&videoID); err != nil {
		t.Fatalf("select video id: %v", err)
	}

	// Session that started 3 days ago and is still open (no ended_at). The
	// video falls inside that span, so it must surface as a candidate.
	var sess sessionResp
	rec := env.do(t, http.MethodPost, "/sessions", map[string]any{
		"name":         "Weekend tournament",
		"modeHint":     "practice",
		"startedAt":    "2026-05-01T08:00:00Z",
		"tournamentId": tournamentID,
	}, &sess)
	mustStatus(t, rec, http.StatusCreated)

	var list sessionCandidateListResp
	rec = env.do(t, http.MethodGet, "/sessions/candidates?videoId="+videoID, nil, &list)
	mustStatus(t, rec, http.StatusOK)

	found := false
	for _, c := range list.Data {
		if c.Type == "existing" && c.Session != nil && c.Session.ID == sess.ID {
			found = true
			if c.GapSec == nil || *c.GapSec != 0 {
				t.Errorf("containing session should have gap=0, got %v", c.GapSec)
			}
		}
	}
	if !found {
		t.Errorf("expected containing session %s in candidates, got %+v", sess.ID, list)
	}
}

func TestSessionsCandidatesRequiresVideoID(t *testing.T) {
	env := setupEnv(t)
	rec := env.do(t, http.MethodGet, "/sessions/candidates", nil, nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestSessionsCandidatesVideoWithoutRecordedAt(t *testing.T) {
	env := setupEnv(t)
	tournamentID := env.createTournament(t, "T1")
	ctx := t.Context()
	storageKey := "test-key-no-recorded"
	if _, err := env.Pool.Exec(ctx,
		`INSERT INTO videos (storage_key, tournament_id) VALUES ($1, $2::uuid)`, storageKey, tournamentID); err != nil {
		t.Fatalf("insert video: %v", err)
	}
	var videoID string
	if err := env.Pool.QueryRow(ctx,
		`SELECT id FROM videos WHERE storage_key = $1`, storageKey).Scan(&videoID); err != nil {
		t.Fatalf("select video id: %v", err)
	}

	var list sessionCandidateListResp
	rec := env.do(t, http.MethodGet, "/sessions/candidates?videoId="+videoID, nil, &list)
	mustStatus(t, rec, http.StatusOK)
	if len(list.Data) != 1 || list.Data[0].Type != "new" {
		t.Errorf("expected single 'new' candidate, got %+v", list.Data)
	}
}
