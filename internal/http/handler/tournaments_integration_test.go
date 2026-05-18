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
