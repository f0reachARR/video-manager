package handler_test

import (
	"net/http"
	"testing"
)

func TestSearchRunsCombinedFilters(t *testing.T) {
	env := setupEnv(t)
	deps := seedRunDeps(t, env)

	// Seed three runs at different times with different tags/memos.
	type tagResp struct {
		ID string `json:"id"`
	}
	var tagB tagResp
	rec := env.do(t, http.MethodPost, "/tags", map[string]any{"name": "b"}, &tagB)
	mustStatus(t, rec, http.StatusCreated)

	create := func(start, memo string, tagIDs []string) string {
		var r runResp
		rec := env.do(t, http.MethodPost, "/runs", map[string]any{
			"sessionId":   deps.SessionID,
			"teamId":      deps.TeamID,
			"robotId":     deps.RobotID,
			"scenarioId":  deps.ScenarioID,
			"startedAt":   start,
			"durationSec": 60,
			"memo":        memo,
			"tagIds":      tagIDs,
		}, &r)
		mustStatus(t, rec, http.StatusCreated)
		return r.ID
	}

	r1 := create("2026-05-01T09:00:00Z", "good run", []string{deps.TagID})
	r2 := create("2026-05-02T09:00:00Z", "bad weather", []string{deps.TagID, tagB.ID})
	r3 := create("2026-05-03T09:00:00Z", "ok", nil)

	// Add a success marker on r2.
	rec = env.do(t, http.MethodPost, "/runs/"+r2+"/markers",
		map[string]any{"runOffsetSec": 1, "category": "success"}, nil)
	mustStatus(t, rec, http.StatusCreated)

	// Period filter (May 2 only): expect r2 alone.
	var list runListResponse
	rec = env.do(t, http.MethodGet,
		"/search/runs?from=2026-05-02T00:00:00Z&to=2026-05-03T00:00:00Z", nil, &list)
	mustStatus(t, rec, http.StatusOK)
	if len(list.Data) != 1 || list.Data[0].ID != r2 {
		t.Errorf("period filter: %+v", list.Data)
	}

	// Memo q
	rec = env.do(t, http.MethodGet, "/search/runs?q=weather", nil, &list)
	mustStatus(t, rec, http.StatusOK)
	if len(list.Data) != 1 || list.Data[0].ID != r2 {
		t.Errorf("memo q: %+v", list.Data)
	}

	// tagIds AND (must have BOTH)
	rec = env.do(t, http.MethodGet, "/search/runs?tagIds="+deps.TagID+","+tagB.ID, nil, &list)
	mustStatus(t, rec, http.StatusOK)
	if len(list.Data) != 1 || list.Data[0].ID != r2 {
		t.Errorf("tag AND: %+v", list.Data)
	}

	// markerCategories OR — r2 has success
	rec = env.do(t, http.MethodGet, "/search/runs?markerCategories=success,failure", nil, &list)
	mustStatus(t, rec, http.StatusOK)
	if len(list.Data) != 1 || list.Data[0].ID != r2 {
		t.Errorf("marker filter: %+v", list.Data)
	}

	// No filters: expect 3, DESC by started_at
	rec = env.do(t, http.MethodGet, "/search/runs", nil, &list)
	mustStatus(t, rec, http.StatusOK)
	if len(list.Data) != 3 || list.Data[0].ID != r3 || list.Data[2].ID != r1 {
		t.Errorf("ordering: %+v", list.Data)
	}
}

type runListResponse struct {
	Data       []runResp `json:"data"`
	Pagination struct {
		HasMore    bool    `json:"hasMore"`
		NextCursor *string `json:"nextCursor"`
	} `json:"pagination"`
}

func TestSearchRunsCursor(t *testing.T) {
	env := setupEnv(t)
	deps := seedRunDeps(t, env)
	for i := 0; i < 3; i++ {
		var r runResp
		rec := env.do(t, http.MethodPost, "/runs", map[string]any{
			"sessionId":  deps.SessionID,
			"teamId":     deps.TeamID,
			"robotId":    deps.RobotID,
			"scenarioId": deps.ScenarioID,
			"startedAt":   "2026-05-0" + string(rune('1'+i)) + "T09:00:00Z",
			"durationSec": 60,
		}, &r)
		mustStatus(t, rec, http.StatusCreated)
	}

	var page runListResponse
	rec := env.do(t, http.MethodGet, "/search/runs?limit=2", nil, &page)
	mustStatus(t, rec, http.StatusOK)
	if len(page.Data) != 2 || !page.Pagination.HasMore || page.Pagination.NextCursor == nil {
		t.Fatalf("first page: %+v", page)
	}

	var rest runListResponse
	rec = env.do(t, http.MethodGet, "/search/runs?limit=2&cursor="+*page.Pagination.NextCursor, nil, &rest)
	mustStatus(t, rec, http.StatusOK)
	if len(rest.Data) != 1 || rest.Pagination.HasMore {
		t.Errorf("second page: %+v", rest)
	}
}
