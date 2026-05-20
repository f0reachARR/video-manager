package handler_test

import (
	"net/http"
	"testing"
	"time"
)

type tournamentResp struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	StartDate *string   `json:"startDate"`
	EndDate   *string   `json:"endDate"`
	CreatedAt time.Time `json:"createdAt"`
}

func TestTournamentCRUD(t *testing.T) {
	env := setupEnv(t)

	var created tournamentResp
	rec := env.do(t, http.MethodPost, "/tournaments", map[string]any{
		"name":      "全国大会",
		"startDate": "2026-08-01",
		"endDate":   "2026-08-03",
	}, &created)
	mustStatus(t, rec, http.StatusCreated)
	if created.StartDate == nil || *created.StartDate != "2026-08-01" {
		t.Errorf("startDate: %+v", created.StartDate)
	}

	// PATCH: clear endDate via null
	var patched tournamentResp
	rec = env.do(t, http.MethodPatch, "/tournaments/"+created.ID,
		map[string]any{"endDate": nil, "name": "全国大会 (更新)"}, &patched)
	mustStatus(t, rec, http.StatusOK)
	if patched.EndDate != nil {
		t.Errorf("endDate should be cleared: %v", *patched.EndDate)
	}
	if patched.Name != "全国大会 (更新)" {
		t.Errorf("name not updated: %q", patched.Name)
	}

	// List
	type tListResp struct {
		Data []tournamentResp `json:"data"`
	}
	var list tListResp
	rec = env.do(t, http.MethodGet, "/tournaments?limit=10", nil, &list)
	mustStatus(t, rec, http.StatusOK)
	if len(list.Data) != 1 || list.Data[0].ID != created.ID {
		t.Errorf("list: %+v", list)
	}

	// Delete + 404 afterwards
	rec = env.do(t, http.MethodDelete, "/tournaments/"+created.ID, nil, nil)
	mustStatus(t, rec, http.StatusNoContent)
	rec = env.do(t, http.MethodGet, "/tournaments/"+created.ID, nil, nil)
	mustStatus(t, rec, http.StatusNotFound)
}

func TestTournamentCreateValidatesName(t *testing.T) {
	env := setupEnv(t)
	rec := env.do(t, http.MethodPost, "/tournaments", map[string]any{}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", rec.Code)
	}
}

// ---------- Tournament <-> Team / Robot links (P0) ----------

type idOnly struct {
	ID string `json:"id"`
}

type tournamentTeamList struct {
	Data []tournamentResp `json:"data"`
}

type tournamentRobotList struct {
	Data []idOnly `json:"data"`
}

// teamRespMini reuses tournamentResp shape just for the ID — tests
// only need the ID and don't care about Tournament-specific fields.
type teamRespMini = idOnly

func mustCreate(t *testing.T, env *testEnv, method, path string, body any, out any) {
	t.Helper()
	rec := env.do(t, method, path, body, out)
	if rec.Code/100 != 2 {
		t.Fatalf("%s %s: %d %s", method, path, rec.Code, rec.Body.String())
	}
}

func TestTournamentReplaceTeams(t *testing.T) {
	env := setupEnv(t)

	var tour tournamentResp
	mustCreate(t, env, http.MethodPost, "/tournaments", map[string]any{"name": "T1"}, &tour)

	var teamA, teamB, teamC teamRespMini
	mustCreate(t, env, http.MethodPost, "/teams", map[string]any{"name": "A"}, &teamA)
	mustCreate(t, env, http.MethodPost, "/teams", map[string]any{"name": "B"}, &teamB)
	mustCreate(t, env, http.MethodPost, "/teams", map[string]any{"name": "C"}, &teamC)

	// PUT with [A, B]
	var list tournamentTeamList
	rec := env.do(t, http.MethodPut, "/tournaments/"+tour.ID+"/teams",
		map[string]any{"teamIds": []string{teamA.ID, teamB.ID}}, &list)
	mustStatus(t, rec, http.StatusOK)
	if len(list.Data) != 2 {
		t.Fatalf("expected 2 teams, got %+v", list)
	}

	// GET reflects PUT
	var got tournamentTeamList
	rec = env.do(t, http.MethodGet, "/tournaments/"+tour.ID+"/teams", nil, &got)
	mustStatus(t, rec, http.StatusOK)
	if len(got.Data) != 2 {
		t.Fatalf("expected 2 teams via GET, got %+v", got)
	}

	// Replace with [C] — A and B must be gone
	rec = env.do(t, http.MethodPut, "/tournaments/"+tour.ID+"/teams",
		map[string]any{"teamIds": []string{teamC.ID}}, &list)
	mustStatus(t, rec, http.StatusOK)
	if len(list.Data) != 1 || list.Data[0].ID != teamC.ID {
		t.Fatalf("expected [C], got %+v", list)
	}

	// PUT with non-existent team id → 422
	rec = env.do(t, http.MethodPut, "/tournaments/"+tour.ID+"/teams",
		map[string]any{"teamIds": []string{"00000000-0000-0000-0000-000000000000"}}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for unknown team, got %d", rec.Code)
	}

	// PUT with bad uuid → 422
	rec = env.do(t, http.MethodPut, "/tournaments/"+tour.ID+"/teams",
		map[string]any{"teamIds": []string{"not-a-uuid"}}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for bad uuid, got %d", rec.Code)
	}

	// 404 for unknown tournament
	rec = env.do(t, http.MethodGet,
		"/tournaments/00000000-0000-0000-0000-000000000000/teams", nil, nil)
	mustStatus(t, rec, http.StatusNotFound)
}

func TestTournamentReplaceRobotsValidatesTeamParticipation(t *testing.T) {
	env := setupEnv(t)

	var tour tournamentResp
	mustCreate(t, env, http.MethodPost, "/tournaments", map[string]any{"name": "T1"}, &tour)

	var teamA, teamB teamRespMini
	mustCreate(t, env, http.MethodPost, "/teams", map[string]any{"name": "A"}, &teamA)
	mustCreate(t, env, http.MethodPost, "/teams", map[string]any{"name": "B"}, &teamB)

	var robotA1, robotB1 idOnly
	mustCreate(t, env, http.MethodPost, "/robots",
		map[string]any{"teamId": teamA.ID, "name": "A1"}, &robotA1)
	mustCreate(t, env, http.MethodPost, "/robots",
		map[string]any{"teamId": teamB.ID, "name": "B1"}, &robotB1)

	// teams = [A] participating
	rec := env.do(t, http.MethodPut, "/tournaments/"+tour.ID+"/teams",
		map[string]any{"teamIds": []string{teamA.ID}}, nil)
	mustStatus(t, rec, http.StatusOK)

	// robots = [A1] → OK
	var rlist tournamentRobotList
	rec = env.do(t, http.MethodPut, "/tournaments/"+tour.ID+"/robots",
		map[string]any{"robotIds": []string{robotA1.ID}}, &rlist)
	mustStatus(t, rec, http.StatusOK)
	if len(rlist.Data) != 1 || rlist.Data[0].ID != robotA1.ID {
		t.Fatalf("expected [A1], got %+v", rlist)
	}

	// robots = [B1] — B not participating → 422
	rec = env.do(t, http.MethodPut, "/tournaments/"+tour.ID+"/robots",
		map[string]any{"robotIds": []string{robotB1.ID}}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for non-participating team's robot, got %d body=%s", rec.Code, rec.Body.String())
	}

	// 既存 robots は A1 のままであるべき (422 トランザクションは巻き戻る)
	rec = env.do(t, http.MethodGet, "/tournaments/"+tour.ID+"/robots", nil, &rlist)
	mustStatus(t, rec, http.StatusOK)
	if len(rlist.Data) != 1 || rlist.Data[0].ID != robotA1.ID {
		t.Fatalf("expected [A1] preserved, got %+v", rlist)
	}
}

func TestTournamentReplaceTeamsCascadesRobotLinks(t *testing.T) {
	env := setupEnv(t)

	var tour tournamentResp
	mustCreate(t, env, http.MethodPost, "/tournaments", map[string]any{"name": "T1"}, &tour)

	var teamA, teamB teamRespMini
	mustCreate(t, env, http.MethodPost, "/teams", map[string]any{"name": "A"}, &teamA)
	mustCreate(t, env, http.MethodPost, "/teams", map[string]any{"name": "B"}, &teamB)

	var robotA1, robotB1 idOnly
	mustCreate(t, env, http.MethodPost, "/robots",
		map[string]any{"teamId": teamA.ID, "name": "A1"}, &robotA1)
	mustCreate(t, env, http.MethodPost, "/robots",
		map[string]any{"teamId": teamB.ID, "name": "B1"}, &robotB1)

	// teams = [A,B], robots = [A1,B1]
	rec := env.do(t, http.MethodPut, "/tournaments/"+tour.ID+"/teams",
		map[string]any{"teamIds": []string{teamA.ID, teamB.ID}}, nil)
	mustStatus(t, rec, http.StatusOK)
	rec = env.do(t, http.MethodPut, "/tournaments/"+tour.ID+"/robots",
		map[string]any{"robotIds": []string{robotA1.ID, robotB1.ID}}, nil)
	mustStatus(t, rec, http.StatusOK)

	// teams = [A] のみに置換 → B1 (B 配下) は自動削除されるはず
	rec = env.do(t, http.MethodPut, "/tournaments/"+tour.ID+"/teams",
		map[string]any{"teamIds": []string{teamA.ID}}, nil)
	mustStatus(t, rec, http.StatusOK)

	var rlist tournamentRobotList
	rec = env.do(t, http.MethodGet, "/tournaments/"+tour.ID+"/robots", nil, &rlist)
	mustStatus(t, rec, http.StatusOK)
	if len(rlist.Data) != 1 || rlist.Data[0].ID != robotA1.ID {
		t.Fatalf("expected only A1 to remain, got %+v", rlist)
	}
}
