package handler_test

import (
	"net/http"
	"testing"
	"time"
)

type runVideoResp struct {
	ID                  string `json:"id"`
	RunID               string `json:"runId"`
	VideoID             string `json:"videoId"`
	VideoOffsetStartSec int32  `json:"videoOffsetStartSec"`
	VideoOffsetEndSec   int32  `json:"videoOffsetEndSec"`
	AngleLabel          string `json:"angleLabel"`
}

type runResp struct {
	ID         string         `json:"id"`
	SessionID  string         `json:"sessionId"`
	Score      *float64       `json:"score"`
	Memo       string         `json:"memo"`
	Videos     []runVideoResp `json:"videos"`
	TagIDs     []string       `json:"tagIds"`
	StartedAt  time.Time      `json:"startedAt"`
	EndedAt    time.Time      `json:"endedAt"`
}

// runDeps creates the masters needed to satisfy Run's foreign keys.
type runDeps struct {
	SessionID  string
	TeamID     string
	RobotID    string
	ScenarioID string
	TagID      string
	VideoID    string
}

func seedRunDeps(t *testing.T, env *testEnv) runDeps {
	t.Helper()
	ctx := t.Context()

	// session
	var sess sessionResp
	rec := env.do(t, http.MethodPost, "/sessions",
		map[string]any{"name": "S", "modeHint": "practice"}, &sess)
	mustStatus(t, rec, http.StatusCreated)

	// team
	type teamResp struct {
		ID string `json:"id"`
	}
	var team teamResp
	rec = env.do(t, http.MethodPost, "/teams", map[string]any{"name": "T"}, &team)
	mustStatus(t, rec, http.StatusCreated)

	// robot
	var robot teamResp
	rec = env.do(t, http.MethodPost, "/robots",
		map[string]any{"teamId": team.ID, "name": "R", "version": "v1"}, &robot)
	mustStatus(t, rec, http.StatusCreated)

	// scenario
	var sc teamResp
	rec = env.do(t, http.MethodPost, "/scenarios", map[string]any{"name": "SC"}, &sc)
	mustStatus(t, rec, http.StatusCreated)

	// tag
	var tag teamResp
	rec = env.do(t, http.MethodPost, "/tags", map[string]any{"name": "important"}, &tag)
	mustStatus(t, rec, http.StatusCreated)

	// video (direct DB insert; tus path not under test here)
	storageKey := "run-test-key"
	if _, err := env.Pool.Exec(ctx,
		`INSERT INTO videos (storage_key, duration_sec) VALUES ($1, 90)`, storageKey); err != nil {
		t.Fatalf("insert video: %v", err)
	}
	var videoID string
	if err := env.Pool.QueryRow(ctx,
		`SELECT id FROM videos WHERE storage_key = $1`, storageKey).Scan(&videoID); err != nil {
		t.Fatalf("select video: %v", err)
	}

	return runDeps{
		SessionID:  sess.ID,
		TeamID:     team.ID,
		RobotID:    robot.ID,
		ScenarioID: sc.ID,
		TagID:      tag.ID,
		VideoID:    videoID,
	}
}

func TestRunsCRUDAndPatchSemantics(t *testing.T) {
	env := setupEnv(t)
	deps := seedRunDeps(t, env)

	// Create run with one tag and a numeric score.
	var run runResp
	rec := env.do(t, http.MethodPost, "/runs", map[string]any{
		"sessionId":  deps.SessionID,
		"teamId":     deps.TeamID,
		"robotId":    deps.RobotID,
		"scenarioId": deps.ScenarioID,
		"startedAt":  "2026-05-01T10:00:00Z",
		"endedAt":    "2026-05-01T10:01:30Z",
		"memo":       "hello",
		"score":      42.5,
		"tagIds":     []string{deps.TagID},
	}, &run)
	mustStatus(t, rec, http.StatusCreated)
	if run.Score == nil || *run.Score != 42.5 {
		t.Errorf("score: %+v", run.Score)
	}
	if len(run.TagIDs) != 1 || run.TagIDs[0] != deps.TagID {
		t.Errorf("tags: %+v", run.TagIDs)
	}

	// Attach a video angle.
	var rv runVideoResp
	rec = env.do(t, http.MethodPost, "/runs/"+run.ID+"/videos", map[string]any{
		"videoId":             deps.VideoID,
		"videoOffsetStartSec": 0,
		"videoOffsetEndSec":   90,
		"angleLabel":          "front",
	}, &rv)
	mustStatus(t, rec, http.StatusCreated)

	// Adding the same video again should conflict.
	rec = env.do(t, http.MethodPost, "/runs/"+run.ID+"/videos", map[string]any{
		"videoId":             deps.VideoID,
		"videoOffsetStartSec": 0,
		"videoOffsetEndSec":   90,
	}, nil)
	if rec.Code != http.StatusConflict {
		t.Errorf("duplicate add expected 409, got %d", rec.Code)
	}

	// Update offsets + label.
	var rvUpdated runVideoResp
	rec = env.do(t, http.MethodPatch, "/runs/"+run.ID+"/videos/"+rv.ID, map[string]any{
		"videoOffsetStartSec": 5,
		"angleLabel":          "side",
	}, &rvUpdated)
	mustStatus(t, rec, http.StatusOK)
	if rvUpdated.VideoOffsetStartSec != 5 || rvUpdated.AngleLabel != "side" {
		t.Errorf("rv update: %+v", rvUpdated)
	}

	// GET run returns embedded videos + tagIds.
	var fetched runResp
	rec = env.do(t, http.MethodGet, "/runs/"+run.ID, nil, &fetched)
	mustStatus(t, rec, http.StatusOK)
	if len(fetched.Videos) != 1 || fetched.Videos[0].ID != rv.ID {
		t.Errorf("expected embedded video, got %+v", fetched.Videos)
	}

	// PATCH run: clear score via null, replace tagIds with empty.
	var cleared runResp
	rec = env.do(t, http.MethodPatch, "/runs/"+run.ID, map[string]any{
		"score":  nil,
		"memo":   "updated",
		"tagIds": []string{},
	}, &cleared)
	mustStatus(t, rec, http.StatusOK)
	if cleared.Score != nil {
		t.Errorf("score not cleared: %v", *cleared.Score)
	}
	if len(cleared.TagIDs) != 0 {
		t.Errorf("tagIds not cleared: %v", cleared.TagIDs)
	}
	if cleared.Memo != "updated" {
		t.Errorf("memo not updated: %q", cleared.Memo)
	}

	// Delete cascades to run_videos.
	rec = env.do(t, http.MethodDelete, "/runs/"+run.ID, nil, nil)
	mustStatus(t, rec, http.StatusNoContent)
	rec = env.do(t, http.MethodGet, "/runs/"+run.ID, nil, nil)
	mustStatus(t, rec, http.StatusNotFound)
}

func TestRunsCreateValidatesUUIDs(t *testing.T) {
	env := setupEnv(t)
	rec := env.do(t, http.MethodPost, "/runs", map[string]any{
		"sessionId":  "not-a-uuid",
		"teamId":     "00000000-0000-0000-0000-000000000000",
		"robotId":    "00000000-0000-0000-0000-000000000000",
		"scenarioId": "00000000-0000-0000-0000-000000000000",
		"startedAt":  "2026-05-01T10:00:00Z",
		"endedAt":    "2026-05-01T10:01:00Z",
	}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", rec.Code)
	}
}
