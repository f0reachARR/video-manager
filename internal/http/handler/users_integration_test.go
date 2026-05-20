package handler_test

import (
	"net/http"
	"testing"
)

type userResp struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Color *string `json:"color"`
}

type userListResp struct {
	Data       []userResp `json:"data"`
	Pagination struct {
		HasMore    bool    `json:"hasMore"`
		NextCursor *string `json:"nextCursor"`
	} `json:"pagination"`
}

func TestUsersCRUD(t *testing.T) {
	env := setupEnv(t)

	// create
	var created userResp
	color := "#ff0000"
	rec := env.do(t, http.MethodPost, "/users",
		map[string]any{"name": "Alice", "color": color}, &created)
	mustStatus(t, rec, http.StatusCreated)
	if created.Name != "Alice" || created.Color == nil || *created.Color != color {
		t.Fatalf("create result mismatch: %+v", created)
	}

	// get
	var fetched userResp
	rec = env.do(t, http.MethodGet, "/users/"+created.ID, nil, &fetched)
	mustStatus(t, rec, http.StatusOK)
	if fetched.ID != created.ID {
		t.Errorf("get id mismatch")
	}

	// list contains created (setupEnv also seeds a default user for auth, so
	// just assert the created user appears rather than counting rows).
	var list userListResp
	rec = env.do(t, http.MethodGet, "/users?limit=10", nil, &list)
	mustStatus(t, rec, http.StatusOK)
	found := false
	for _, u := range list.Data {
		if u.ID == created.ID {
			found = true
		}
	}
	if !found {
		t.Errorf("list missing created user: %+v", list)
	}

	// patch: clear color via explicit null
	var patched userResp
	rec = env.do(t, http.MethodPatch, "/users/"+created.ID,
		map[string]any{"color": nil}, &patched)
	mustStatus(t, rec, http.StatusOK)
	if patched.Color != nil {
		t.Errorf("color should be cleared, got %v", *patched.Color)
	}

	// patch missing color leaves the prior (now-null) value
	rec = env.do(t, http.MethodPatch, "/users/"+created.ID,
		map[string]any{"name": "Alice Updated"}, &patched)
	mustStatus(t, rec, http.StatusOK)
	if patched.Name != "Alice Updated" || patched.Color != nil {
		t.Errorf("update name kept color: %+v", patched)
	}

	// delete
	rec = env.do(t, http.MethodDelete, "/users/"+created.ID, nil, nil)
	mustStatus(t, rec, http.StatusNoContent)

	// get after delete -> 404
	rec = env.do(t, http.MethodGet, "/users/"+created.ID, nil, nil)
	mustStatus(t, rec, http.StatusNotFound)
}

func TestUsersValidation(t *testing.T) {
	env := setupEnv(t)
	rec := env.do(t, http.MethodPost, "/users", map[string]any{}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422 for missing name, got %d", rec.Code)
	}
}

func TestUsersListPagination(t *testing.T) {
	env := setupEnv(t)
	// Seed three users.
	ids := []string{}
	for _, n := range []string{"u1", "u2", "u3"} {
		var u userResp
		rec := env.do(t, http.MethodPost, "/users", map[string]any{"name": n}, &u)
		mustStatus(t, rec, http.StatusCreated)
		ids = append(ids, u.ID)
	}

	// setupEnv seeds a default user (created_at < any seeded above), so we
	// have 4 rows total. Page through them in groups of 3 to land u3 alone
	// on the final page.
	var page userListResp
	rec := env.do(t, http.MethodGet, "/users?limit=3", nil, &page)
	mustStatus(t, rec, http.StatusOK)
	if len(page.Data) != 3 || !page.Pagination.HasMore || page.Pagination.NextCursor == nil {
		t.Fatalf("first page: %+v", page)
	}

	// Fetch next page.
	var rest userListResp
	rec = env.do(t, http.MethodGet, "/users?limit=3&cursor="+*page.Pagination.NextCursor, nil, &rest)
	mustStatus(t, rec, http.StatusOK)
	if len(rest.Data) != 1 || rest.Pagination.HasMore {
		t.Errorf("second page: %+v", rest)
	}
	if rest.Data[0].ID != ids[2] {
		t.Errorf("expected last id %s, got %s", ids[2], rest.Data[0].ID)
	}
}
