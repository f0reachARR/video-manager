package handler_test

import (
	"net/http"
	"testing"
	"time"
)

type markerResp struct {
	ID           string    `json:"id"`
	RunID        string    `json:"runId"`
	AuthorID     *string   `json:"authorId"`
	RunOffsetSec int32     `json:"runOffsetSec"`
	Label        string    `json:"label"`
	Category     string    `json:"category"`
	CreatedAt    time.Time `json:"createdAt"`
}

type markerListResp struct {
	Data       []markerResp `json:"data"`
	Pagination struct {
		HasMore    bool    `json:"hasMore"`
		NextCursor *string `json:"nextCursor"`
	} `json:"pagination"`
}

func createBasicRun(t *testing.T, env *testEnv) (runID, userID string) {
	t.Helper()
	deps := seedRunDeps(t, env)

	// create user to satisfy author FK via X-User-Id
	var user userResp
	rec := env.do(t, http.MethodPost, "/users", map[string]any{"name": "Author"}, &user)
	mustStatus(t, rec, http.StatusCreated)

	var run runResp
	rec = env.do(t, http.MethodPost, "/runs", map[string]any{
		"sessionId":  deps.SessionID,
		"teamId":     deps.TeamID,
		"robotId":    deps.RobotID,
		"scenarioId": deps.ScenarioID,
		"startedAt":  "2026-05-01T10:00:00Z",
		"endedAt":    "2026-05-01T10:01:30Z",
	}, &run)
	mustStatus(t, rec, http.StatusCreated)
	return run.ID, user.ID
}

func TestMarkerCRUDAndCategoryFilter(t *testing.T) {
	env := setupEnv(t)
	runID, userID := createBasicRun(t, env)

	// Create with explicit category + label, authored via X-User-Id
	var m1 markerResp
	rec := env.doWithHeaders(t, http.MethodPost, "/runs/"+runID+"/markers",
		map[string]any{"runOffsetSec": 5, "label": "脱輪", "category": "failure"}, &m1,
		map[string]string{"X-User-Id": userID})
	mustStatus(t, rec, http.StatusCreated)
	if m1.Category != "failure" || m1.Label != "脱輪" || m1.RunOffsetSec != 5 {
		t.Errorf("create: %+v", m1)
	}
	if m1.AuthorID == nil || *m1.AuthorID != userID {
		t.Errorf("expected authorId=%s got %v", userID, m1.AuthorID)
	}

	// Create without category defaults to "note"
	var m2 markerResp
	rec = env.do(t, http.MethodPost, "/runs/"+runID+"/markers",
		map[string]any{"runOffsetSec": 30}, &m2)
	mustStatus(t, rec, http.StatusCreated)
	if m2.Category != "note" {
		t.Errorf("default category: got %q want note", m2.Category)
	}

	// Create a success marker
	var m3 markerResp
	rec = env.do(t, http.MethodPost, "/runs/"+runID+"/markers",
		map[string]any{"runOffsetSec": 70, "category": "success"}, &m3)
	mustStatus(t, rec, http.StatusCreated)

	// List all — should be ordered by run_offset_sec asc
	var all markerListResp
	rec = env.do(t, http.MethodGet, "/runs/"+runID+"/markers", nil, &all)
	mustStatus(t, rec, http.StatusOK)
	if len(all.Data) != 3 {
		t.Fatalf("expected 3 markers, got %d", len(all.Data))
	}
	if all.Data[0].RunOffsetSec != 5 || all.Data[2].RunOffsetSec != 70 {
		t.Errorf("ordering: %+v", all.Data)
	}

	// Filter by category=failure,success
	var filtered markerListResp
	rec = env.do(t, http.MethodGet, "/runs/"+runID+"/markers?category=failure,success", nil, &filtered)
	mustStatus(t, rec, http.StatusOK)
	if len(filtered.Data) != 2 {
		t.Errorf("filter: %+v", filtered.Data)
	}

	// Update label + category
	var updated markerResp
	rec = env.do(t, http.MethodPatch, "/markers/"+m1.ID,
		map[string]any{"label": "完璧", "category": "success"}, &updated)
	mustStatus(t, rec, http.StatusOK)
	if updated.Label != "完璧" || updated.Category != "success" {
		t.Errorf("update: %+v", updated)
	}

	// Delete + 404 afterwards
	rec = env.do(t, http.MethodDelete, "/markers/"+m2.ID, nil, nil)
	mustStatus(t, rec, http.StatusNoContent)
	rec = env.do(t, http.MethodPatch, "/markers/"+m2.ID, map[string]any{"label": "x"}, nil)
	mustStatus(t, rec, http.StatusNotFound)
}

func TestMarkerCreateValidatesRun(t *testing.T) {
	env := setupEnv(t)
	rec := env.do(t, http.MethodPost,
		"/runs/00000000-0000-0000-0000-000000000000/markers",
		map[string]any{"runOffsetSec": 1}, nil)
	mustStatus(t, rec, http.StatusNotFound)
}

func TestMarkerCreateRejectsInvalidCategory(t *testing.T) {
	env := setupEnv(t)
	runID, _ := createBasicRun(t, env)
	rec := env.do(t, http.MethodPost, "/runs/"+runID+"/markers",
		map[string]any{"runOffsetSec": 1, "category": "lol"}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", rec.Code)
	}
}

func TestMarkerCreateRejectsNegativeOffset(t *testing.T) {
	env := setupEnv(t)
	runID, _ := createBasicRun(t, env)
	rec := env.do(t, http.MethodPost, "/runs/"+runID+"/markers",
		map[string]any{"runOffsetSec": -1, "category": "note"}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", rec.Code)
	}
}
