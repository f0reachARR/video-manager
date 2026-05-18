package handler_test

import (
	"net/http"
	"testing"
)

type teamMarkerStatsResp struct {
	TeamID  string `json:"teamId"`
	Success int64  `json:"success"`
	Failure int64  `json:"failure"`
	Note    int64  `json:"note"`
}

func TestTeamMarkerStatsAggregates(t *testing.T) {
	env := setupEnv(t)
	deps := seedRunDeps(t, env)

	// Create a second run on the same team to verify aggregation across runs.
	var r2 runResp
	rec := env.do(t, http.MethodPost, "/runs", map[string]any{
		"sessionId":  deps.SessionID,
		"teamId":     deps.TeamID,
		"robotId":    deps.RobotID,
		"scenarioId": deps.ScenarioID,
		"startedAt":  "2026-05-02T10:00:00Z",
		"endedAt":    "2026-05-02T10:01:30Z",
	}, &r2)
	mustStatus(t, rec, http.StatusCreated)

	// Build a run via the same deps' team to capture the existing run too.
	// Use the run from seedRunDeps by creating one explicitly:
	var r1 runResp
	rec = env.do(t, http.MethodPost, "/runs", map[string]any{
		"sessionId":  deps.SessionID,
		"teamId":     deps.TeamID,
		"robotId":    deps.RobotID,
		"scenarioId": deps.ScenarioID,
		"startedAt":  "2026-05-01T10:00:00Z",
		"endedAt":    "2026-05-01T10:01:30Z",
	}, &r1)
	mustStatus(t, rec, http.StatusCreated)

	// Drop markers: r1 has 2 success + 1 note, r2 has 1 failure.
	addMarker := func(runID, cat string) {
		rec := env.do(t, http.MethodPost, "/runs/"+runID+"/markers",
			map[string]any{"runOffsetSec": 1, "category": cat}, nil)
		mustStatus(t, rec, http.StatusCreated)
	}
	addMarker(r1.ID, "success")
	addMarker(r1.ID, "success")
	addMarker(r1.ID, "note")
	addMarker(r2.ID, "failure")

	var stats teamMarkerStatsResp
	rec = env.do(t, http.MethodGet, "/teams/"+deps.TeamID+"/marker-stats", nil, &stats)
	mustStatus(t, rec, http.StatusOK)
	if stats.Success != 2 || stats.Failure != 1 || stats.Note != 1 {
		t.Errorf("stats: %+v", stats)
	}
	if stats.TeamID != deps.TeamID {
		t.Errorf("teamId echo: %q vs %q", stats.TeamID, deps.TeamID)
	}
}

func TestTeamMarkerStatsEmpty(t *testing.T) {
	env := setupEnv(t)
	// Team with no runs.
	type idResp struct{ ID string `json:"id"` }
	var team idResp
	rec := env.do(t, http.MethodPost, "/teams", map[string]any{"name": "Lonely"}, &team)
	mustStatus(t, rec, http.StatusCreated)

	var stats teamMarkerStatsResp
	rec = env.do(t, http.MethodGet, "/teams/"+team.ID+"/marker-stats", nil, &stats)
	mustStatus(t, rec, http.StatusOK)
	if stats.Success+stats.Failure+stats.Note != 0 {
		t.Errorf("expected zeros, got %+v", stats)
	}
}

func TestTeamMarkerStatsTeamNotFound(t *testing.T) {
	env := setupEnv(t)
	rec := env.do(t, http.MethodGet,
		"/teams/00000000-0000-0000-0000-000000000000/marker-stats", nil, nil)
	mustStatus(t, rec, http.StatusNotFound)
}
