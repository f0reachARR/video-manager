package handler_test

import (
	"net/http"
	"testing"
	"time"
)

type scoutingNoteResp struct {
	ID           string    `json:"id"`
	MatchID      string    `json:"matchId"`
	TargetTeamID string    `json:"targetTeamId"`
	PlainText    string    `json:"plainText"`
	UpdatedAt    time.Time `json:"updatedAt"`
	CreatedAt    time.Time `json:"createdAt"`
}

func seedMatchAndTeams(t *testing.T, env *testEnv) (matchID, teamA, teamB string) {
	t.Helper()
	type idR struct{ ID string `json:"id"` }

	var tour idR
	rec := env.do(t, http.MethodPost, "/tournaments", map[string]any{"name": "T"}, &tour)
	mustStatus(t, rec, http.StatusCreated)

	mkTeam := func(name string) string {
		var x idR
		rec := env.do(t, http.MethodPost, "/teams", map[string]any{"name": name}, &x)
		mustStatus(t, rec, http.StatusCreated)
		return x.ID
	}
	teamA = mkTeam("A")
	teamB = mkTeam("B")

	var m idR
	rec = env.do(t, http.MethodPost, "/matches", map[string]any{
		"tournamentId": tour.ID, "teamAId": teamA, "teamBId": teamB,
	}, &m)
	mustStatus(t, rec, http.StatusCreated)
	matchID = m.ID
	return
}

func TestScoutingNoteCRUD(t *testing.T) {
	env := setupEnv(t)
	matchID, _, teamB := seedMatchAndTeams(t, env)

	// Create
	var n1 scoutingNoteResp
	rec := env.do(t, http.MethodPost, "/matches/"+matchID+"/scouting-notes",
		map[string]any{"targetTeamId": teamB}, &n1)
	mustStatus(t, rec, http.StatusCreated)
	if n1.PlainText != "" {
		t.Errorf("plainText should start empty: %q", n1.PlainText)
	}

	// Duplicate (match, team) → 409
	rec = env.do(t, http.MethodPost, "/matches/"+matchID+"/scouting-notes",
		map[string]any{"targetTeamId": teamB}, nil)
	if rec.Code != http.StatusConflict {
		t.Errorf("duplicate expected 409, got %d", rec.Code)
	}

	// Get
	var fetched scoutingNoteResp
	rec = env.do(t, http.MethodGet, "/scouting-notes/"+n1.ID, nil, &fetched)
	mustStatus(t, rec, http.StatusOK)
	if fetched.ID != n1.ID {
		t.Errorf("get id mismatch")
	}

	// List by match
	type listR struct {
		Data []scoutingNoteResp `json:"data"`
	}
	var list listR
	rec = env.do(t, http.MethodGet, "/matches/"+matchID+"/scouting-notes", nil, &list)
	mustStatus(t, rec, http.StatusOK)
	if len(list.Data) != 1 || list.Data[0].ID != n1.ID {
		t.Errorf("list: %+v", list)
	}

	// Delete + 404 afterwards
	rec = env.do(t, http.MethodDelete, "/scouting-notes/"+n1.ID, nil, nil)
	mustStatus(t, rec, http.StatusNoContent)
	rec = env.do(t, http.MethodGet, "/scouting-notes/"+n1.ID, nil, nil)
	mustStatus(t, rec, http.StatusNotFound)
}

func TestScoutingNoteCreateRejectsBadTeam(t *testing.T) {
	env := setupEnv(t)
	matchID, _, _ := seedMatchAndTeams(t, env)
	rec := env.do(t, http.MethodPost, "/matches/"+matchID+"/scouting-notes",
		map[string]any{"targetTeamId": "not-uuid"}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", rec.Code)
	}
}

func TestScoutingNoteCreateMatchNotFound(t *testing.T) {
	env := setupEnv(t)
	rec := env.do(t, http.MethodPost,
		"/matches/00000000-0000-0000-0000-000000000000/scouting-notes",
		map[string]any{"targetTeamId": "00000000-0000-0000-0000-000000000001"}, nil)
	mustStatus(t, rec, http.StatusNotFound)
}
