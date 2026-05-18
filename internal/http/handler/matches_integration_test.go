package handler_test

import (
	"net/http"
	"testing"
	"time"
)

type matchResp struct {
	ID           string     `json:"id"`
	TournamentID string     `json:"tournamentId"`
	TeamAID      string     `json:"teamAId"`
	TeamBID      string     `json:"teamBId"`
	ScheduledAt  *time.Time `json:"scheduledAt"`
	CreatedAt    time.Time  `json:"createdAt"`
}

func TestMatchCRUDAndFilter(t *testing.T) {
	env := setupEnv(t)

	// fixtures: tournament + 3 teams
	type idResp struct {
		ID string `json:"id"`
	}
	var tour idResp
	rec := env.do(t, http.MethodPost, "/tournaments", map[string]any{"name": "T1"}, &tour)
	mustStatus(t, rec, http.StatusCreated)
	mkTeam := func(name string) string {
		var t1 idResp
		rec := env.do(t, http.MethodPost, "/teams", map[string]any{"name": name}, &t1)
		mustStatus(t, rec, http.StatusCreated)
		return t1.ID
	}
	a := mkTeam("A")
	b := mkTeam("B")
	c := mkTeam("C")

	// Same-team rejection
	rec = env.do(t, http.MethodPost, "/matches", map[string]any{
		"tournamentId": tour.ID, "teamAId": a, "teamBId": a,
	}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422 for same team, got %d", rec.Code)
	}

	// Create two matches
	var m1, m2 matchResp
	rec = env.do(t, http.MethodPost, "/matches", map[string]any{
		"tournamentId": tour.ID, "teamAId": a, "teamBId": b,
		"scheduledAt": "2026-08-01T10:00:00Z",
	}, &m1)
	mustStatus(t, rec, http.StatusCreated)
	if m1.ScheduledAt == nil {
		t.Fatalf("scheduledAt: %+v", m1)
	}
	rec = env.do(t, http.MethodPost, "/matches", map[string]any{
		"tournamentId": tour.ID, "teamAId": a, "teamBId": c,
	}, &m2)
	mustStatus(t, rec, http.StatusCreated)

	// PATCH: clear scheduledAt + swap team
	var patched matchResp
	rec = env.do(t, http.MethodPatch, "/matches/"+m1.ID,
		map[string]any{"scheduledAt": nil, "teamBId": c}, &patched)
	mustStatus(t, rec, http.StatusOK)
	if patched.ScheduledAt != nil || patched.TeamBID != c {
		t.Errorf("patch: %+v", patched)
	}

	// List filter by tournamentId
	type mListResp struct {
		Data []matchResp `json:"data"`
	}
	var list mListResp
	rec = env.do(t, http.MethodGet, "/matches?tournamentId="+tour.ID, nil, &list)
	mustStatus(t, rec, http.StatusOK)
	if len(list.Data) != 2 {
		t.Errorf("list: %+v", list.Data)
	}

	// Delete
	rec = env.do(t, http.MethodDelete, "/matches/"+m1.ID, nil, nil)
	mustStatus(t, rec, http.StatusNoContent)
	rec = env.do(t, http.MethodGet, "/matches/"+m1.ID, nil, nil)
	mustStatus(t, rec, http.StatusNotFound)
}

func TestMatchCreateRejectsInvalidTournament(t *testing.T) {
	env := setupEnv(t)
	rec := env.do(t, http.MethodPost, "/matches", map[string]any{
		"tournamentId": "not-uuid", "teamAId": "x", "teamBId": "y",
	}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", rec.Code)
	}
}
