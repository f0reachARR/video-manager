package handler_test

import (
	"net/http"
	"testing"
	"time"
)

type scoutingNoteResp struct {
	ID           string    `json:"id"`
	TournamentID string    `json:"tournamentId"`
	TeamID       string    `json:"teamId"`
	PlainText    string    `json:"plainText"`
	UpdatedAt    time.Time `json:"updatedAt"`
	CreatedAt    time.Time `json:"createdAt"`
}

func seedTournamentAndTeams(t *testing.T, env *testEnv) (tournamentID, teamA, teamB string) {
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
	tournamentID = tour.ID
	return
}

func TestScoutingNoteAutoCreateAndList(t *testing.T) {
	env := setupEnv(t)
	tournamentID, _, teamB := seedTournamentAndTeams(t, env)

	// GetByTeam auto-creates the note on first access — the SPA opens the
	// team page and the Hocuspocus document is guaranteed to exist.
	var n1 scoutingNoteResp
	rec := env.do(t, http.MethodGet,
		"/tournaments/"+tournamentID+"/teams/"+teamB+"/scouting-note", nil, &n1)
	mustStatus(t, rec, http.StatusOK)
	if n1.PlainText != "" {
		t.Errorf("plainText should start empty: %q", n1.PlainText)
	}
	if n1.TournamentID != tournamentID || n1.TeamID != teamB {
		t.Errorf("unexpected note: %+v", n1)
	}

	// Second GET should return the same row (idempotent upsert).
	var n2 scoutingNoteResp
	rec = env.do(t, http.MethodGet,
		"/tournaments/"+tournamentID+"/teams/"+teamB+"/scouting-note", nil, &n2)
	mustStatus(t, rec, http.StatusOK)
	if n2.ID != n1.ID {
		t.Errorf("expected same id, got %q vs %q", n1.ID, n2.ID)
	}

	// Get by id
	var fetched scoutingNoteResp
	rec = env.do(t, http.MethodGet, "/scouting-notes/"+n1.ID, nil, &fetched)
	mustStatus(t, rec, http.StatusOK)
	if fetched.ID != n1.ID {
		t.Errorf("get id mismatch")
	}

	// List by tournament
	type listR struct {
		Data []scoutingNoteResp `json:"data"`
	}
	var list listR
	rec = env.do(t, http.MethodGet, "/tournaments/"+tournamentID+"/scouting-notes", nil, &list)
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

func TestScoutingNoteRejectsBadTournament(t *testing.T) {
	env := setupEnv(t)
	_, _, teamB := seedTournamentAndTeams(t, env)
	rec := env.do(t, http.MethodGet,
		"/tournaments/00000000-0000-0000-0000-000000000000/teams/"+teamB+"/scouting-note", nil, nil)
	mustStatus(t, rec, http.StatusNotFound)
}

func TestScoutingNoteRejectsBadTeam(t *testing.T) {
	env := setupEnv(t)
	tournamentID, _, _ := seedTournamentAndTeams(t, env)
	rec := env.do(t, http.MethodGet,
		"/tournaments/"+tournamentID+"/teams/00000000-0000-0000-0000-000000000000/scouting-note", nil, nil)
	mustStatus(t, rec, http.StatusNotFound)
}
