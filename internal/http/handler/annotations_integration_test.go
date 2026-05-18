package handler_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

type annotationResp struct {
	ID             string          `json:"id"`
	VideoID        string          `json:"videoId"`
	AuthorID       *string         `json:"authorId"`
	StartOffsetSec float64         `json:"startOffsetSec"`
	EndOffsetSec   float64         `json:"endOffsetSec"`
	Type           string          `json:"type"`
	Geometry       json.RawMessage `json:"geometry"`
	Style          json.RawMessage `json:"style"`
	Label          string          `json:"label"`
	CreatedAt      time.Time       `json:"createdAt"`
}

type annotationListResp struct {
	Data []annotationResp `json:"data"`
}

func createTestVideo(t *testing.T, env *testEnv, storageKey string) string {
	t.Helper()
	if _, err := env.Pool.Exec(t.Context(),
		`INSERT INTO videos (storage_key, duration_sec) VALUES ($1, 60)`, storageKey); err != nil {
		t.Fatalf("insert video: %v", err)
	}
	var id string
	if err := env.Pool.QueryRow(t.Context(),
		`SELECT id FROM videos WHERE storage_key = $1`, storageKey).Scan(&id); err != nil {
		t.Fatalf("select video: %v", err)
	}
	return id
}

func TestAnnotationCRUD(t *testing.T) {
	env := setupEnv(t)
	videoID := createTestVideo(t, env, "anno-test-key")

	// user as author via X-User-Id
	type idR struct{ ID string `json:"id"` }
	var user idR
	rec := env.do(t, http.MethodPost, "/users", map[string]any{"name": "Coach"}, &user)
	mustStatus(t, rec, http.StatusCreated)

	// Create point annotation
	var a1 annotationResp
	rec = env.doWithHeaders(t, http.MethodPost, "/videos/"+videoID+"/annotations",
		map[string]any{
			"startOffsetSec": 5.0,
			"endOffsetSec":   8.0,
			"type":           "point",
			"geometry":       map[string]any{"x": 0.3, "y": 0.5},
			"label":          "important",
		}, &a1, map[string]string{"X-User-Id": user.ID})
	mustStatus(t, rec, http.StatusCreated)
	if a1.Type != "point" || a1.Label != "important" {
		t.Errorf("create: %+v", a1)
	}
	if a1.AuthorID == nil || *a1.AuthorID != user.ID {
		t.Errorf("authorId: %v want %v", a1.AuthorID, user.ID)
	}

	// Create rect annotation
	var a2 annotationResp
	rec = env.do(t, http.MethodPost, "/videos/"+videoID+"/annotations",
		map[string]any{
			"startOffsetSec": 10.0,
			"endOffsetSec":   12.0,
			"type":           "rect",
			"geometry":       map[string]any{"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4},
			"style":          map[string]any{"stroke": "#ff0000"},
		}, &a2)
	mustStatus(t, rec, http.StatusCreated)

	// List by video
	var list annotationListResp
	rec = env.do(t, http.MethodGet, "/videos/"+videoID+"/annotations", nil, &list)
	mustStatus(t, rec, http.StatusOK)
	if len(list.Data) != 2 {
		t.Fatalf("list count: %+v", list.Data)
	}
	if list.Data[0].ID != a1.ID {
		t.Errorf("ordering: %+v", list.Data)
	}

	// Update label + geometry
	var updated annotationResp
	rec = env.do(t, http.MethodPatch, "/annotations/"+a1.ID, map[string]any{
		"label":    "updated",
		"geometry": map[string]any{"x": 0.5, "y": 0.5},
	}, &updated)
	mustStatus(t, rec, http.StatusOK)
	if updated.Label != "updated" {
		t.Errorf("label: %q", updated.Label)
	}

	// Delete + 404
	rec = env.do(t, http.MethodDelete, "/annotations/"+a2.ID, nil, nil)
	mustStatus(t, rec, http.StatusNoContent)
	rec = env.do(t, http.MethodPatch, "/annotations/"+a2.ID, map[string]any{"label": "x"}, nil)
	mustStatus(t, rec, http.StatusNotFound)
}

func TestAnnotationCreateRejectsBadType(t *testing.T) {
	env := setupEnv(t)
	videoID := createTestVideo(t, env, "anno-bad-type")
	rec := env.do(t, http.MethodPost, "/videos/"+videoID+"/annotations", map[string]any{
		"startOffsetSec": 0, "endOffsetSec": 1,
		"type": "circle", "geometry": map[string]any{},
	}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", rec.Code)
	}
}

func TestAnnotationCreateRejectsEndBeforeStart(t *testing.T) {
	env := setupEnv(t)
	videoID := createTestVideo(t, env, "anno-bad-range")
	rec := env.do(t, http.MethodPost, "/videos/"+videoID+"/annotations", map[string]any{
		"startOffsetSec": 5, "endOffsetSec": 3,
		"type": "point", "geometry": map[string]any{"x": 0.1, "y": 0.1},
	}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", rec.Code)
	}
}

func TestAnnotationListVideoNotFound(t *testing.T) {
	env := setupEnv(t)
	rec := env.do(t, http.MethodGet,
		"/videos/00000000-0000-0000-0000-000000000000/annotations", nil, nil)
	mustStatus(t, rec, http.StatusNotFound)
}
