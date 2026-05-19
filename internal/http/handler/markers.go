package handler

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/f0reachARR/video-manager/internal/auth"
	"github.com/f0reachARR/video-manager/internal/db/sqlc"
	"github.com/f0reachARR/video-manager/internal/realtime"
)

type Markers struct {
	Q   *sqlc.Queries
	Hub *realtime.Hub
}

type markerEvent struct {
	Type   string    `json:"type"` // "marker.created" | "marker.updated" | "marker.deleted"
	RunID  string    `json:"runId"`
	Marker markerDTO `json:"marker"`
}

type markerDeleteEvent struct {
	Type     string `json:"type"`
	RunID    string `json:"runId"`
	MarkerID string `json:"markerId"`
}

func (h *Markers) publish(runID string, payload any) {
	if h.Hub == nil {
		return
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		slog.Warn("marker event marshal failed", "error", err)
		return
	}
	h.Hub.Publish("run:"+runID, raw)
}

type markerDTO struct {
	ID           string    `json:"id"`
	RunID        string    `json:"runId"`
	AuthorID     *string   `json:"authorId"`
	RunOffsetSec int32     `json:"runOffsetSec"`
	Label        string    `json:"label"`
	Category     string    `json:"category"`
	CreatedAt    time.Time `json:"createdAt"`
}

func toMarkerDTO(m sqlc.Marker) markerDTO {
	var author *string
	if m.AuthorID.Valid {
		s := uuidString(m.AuthorID)
		author = &s
	}
	return markerDTO{
		ID:           uuidString(m.ID),
		RunID:        uuidString(m.RunID),
		AuthorID:     author,
		RunOffsetSec: m.RunOffsetSec,
		Label:        m.Label,
		Category:     string(m.Category),
		CreatedAt:    m.CreatedAt.Time,
	}
}

type markerListResponse struct {
	Data       []markerDTO `json:"data"`
	Pagination pageOut     `json:"pagination"`
}

type createMarkerRequest struct {
	RunOffsetSec int32  `json:"runOffsetSec"`
	Label        string `json:"label"`
	Category     string `json:"category"`
}

type updateMarkerRequest struct {
	RunOffsetSec *int32  `json:"runOffsetSec"`
	Label        *string `json:"label"`
	Category     *string `json:"category"`
}

// markerCursor encodes "<offset>|<uuid>" as base64 — markers are ordered by
// (run_offset_sec, id), not (created_at, id) like the other resources.
func encodeMarkerCursor(offset int32, id pgtype.UUID) string {
	raw := fmt.Sprintf("%d|%s", offset, uuidString(id))
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeMarkerCursor(s string) (*int32, pgtype.UUID, error) {
	if s == "" {
		return nil, pgtype.UUID{}, nil
	}
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, pgtype.UUID{}, fmt.Errorf("invalid cursor: %w", err)
	}
	parts := strings.SplitN(string(b), "|", 2)
	if len(parts) != 2 {
		return nil, pgtype.UUID{}, errors.New("invalid cursor format")
	}
	n, err := strconv.ParseInt(parts[0], 10, 32)
	if err != nil {
		return nil, pgtype.UUID{}, fmt.Errorf("invalid cursor offset: %w", err)
	}
	off := int32(n)
	id, err := parseUUIDParam(parts[1])
	if err != nil {
		return nil, pgtype.UUID{}, fmt.Errorf("invalid cursor id: %w", err)
	}
	return &off, id, nil
}

func parseMarkerCategory(s string) (sqlc.MarkerCategory, error) {
	switch sqlc.MarkerCategory(s) {
	case sqlc.MarkerCategorySuccess, sqlc.MarkerCategoryFailure, sqlc.MarkerCategoryNote:
		return sqlc.MarkerCategory(s), nil
	}
	return "", fmt.Errorf("invalid category %q", s)
}

func currentAuthorID(r *http.Request) pgtype.UUID {
	return auth.UserIDFromContext(r.Context())
}

func (h *Markers) List(w http.ResponseWriter, r *http.Request) {
	runID, err := parseUUIDParam(chi.URLParam(r, "runId"))
	if err != nil {
		badRequest(w, "invalid runId")
		return
	}
	if _, err := h.Q.GetRun(r.Context(), runID); err != nil {
		if isNoRows(err) {
			notFound(w, "run not found")
			return
		}
		internalError(w, err)
		return
	}
	limit, err := limitFromQuery(r)
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	cursorOff, cursorID, err := decodeMarkerCursor(r.URL.Query().Get("cursor"))
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	var cats []string
	if raw := r.URL.Query().Get("category"); raw != "" {
		for _, c := range strings.Split(raw, ",") {
			c = strings.TrimSpace(c)
			if c == "" {
				continue
			}
			mc, err := parseMarkerCategory(c)
			if err != nil {
				badRequest(w, err.Error())
				return
			}
			cats = append(cats, string(mc))
		}
	}
	rows, err := h.Q.ListMarkersByRun(r.Context(), sqlc.ListMarkersByRunParams{
		Limit:           limit + 1,
		RunID:           runID,
		CursorRunOffset: cursorOff,
		CursorID:        cursorID,
		Categories:      cats,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	page, pg := paginate(rows, limit, func(m sqlc.Marker) string {
		return encodeMarkerCursor(m.RunOffsetSec, m.ID)
	})
	out := make([]markerDTO, len(page))
	for i, m := range page {
		out[i] = toMarkerDTO(m)
	}
	writeJSON(w, http.StatusOK, markerListResponse{Data: out, Pagination: pg})
}

func (h *Markers) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "markerId"))
	if err != nil {
		badRequest(w, "invalid markerId")
		return
	}
	m, err := h.Q.GetMarker(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "marker not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toMarkerDTO(m))
}

func (h *Markers) Create(w http.ResponseWriter, r *http.Request) {
	runID, err := parseUUIDParam(chi.URLParam(r, "runId"))
	if err != nil {
		badRequest(w, "invalid runId")
		return
	}
	if _, err := h.Q.GetRun(r.Context(), runID); err != nil {
		if isNoRows(err) {
			notFound(w, "run not found")
			return
		}
		internalError(w, err)
		return
	}
	var req createMarkerRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.Category == "" {
		req.Category = string(sqlc.MarkerCategoryNote)
	}
	cat, err := parseMarkerCategory(req.Category)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", err.Error(), nil)
		return
	}
	if req.RunOffsetSec < 0 {
		writeError(w, http.StatusUnprocessableEntity, "validation", "runOffsetSec must be >= 0", nil)
		return
	}
	m, err := h.Q.CreateMarker(r.Context(), sqlc.CreateMarkerParams{
		RunID:        runID,
		AuthorID:     currentAuthorID(r),
		RunOffsetSec: req.RunOffsetSec,
		Label:        req.Label,
		Category:     cat,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	dto := toMarkerDTO(m)
	h.publish(uuidString(runID), markerEvent{Type: "marker.created", RunID: uuidString(runID), Marker: dto})
	writeJSON(w, http.StatusCreated, dto)
}

func (h *Markers) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "markerId"))
	if err != nil {
		badRequest(w, "invalid markerId")
		return
	}
	var req updateMarkerRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	params := sqlc.UpdateMarkerParams{ID: id, RunOffsetSec: req.RunOffsetSec, Label: req.Label}
	if req.RunOffsetSec != nil && *req.RunOffsetSec < 0 {
		writeError(w, http.StatusUnprocessableEntity, "validation", "runOffsetSec must be >= 0", nil)
		return
	}
	if req.Category != nil {
		cat, err := parseMarkerCategory(*req.Category)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "validation", err.Error(), nil)
			return
		}
		params.Category = sqlc.NullMarkerCategory{MarkerCategory: cat, Valid: true}
	}
	m, err := h.Q.UpdateMarker(r.Context(), params)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "marker not found")
			return
		}
		internalError(w, err)
		return
	}
	dto := toMarkerDTO(m)
	h.publish(dto.RunID, markerEvent{Type: "marker.updated", RunID: dto.RunID, Marker: dto})
	writeJSON(w, http.StatusOK, dto)
}

func (h *Markers) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "markerId"))
	if err != nil {
		badRequest(w, "invalid markerId")
		return
	}
	// Read first so we know which run to publish on.
	existing, err := h.Q.GetMarker(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "marker not found")
			return
		}
		internalError(w, err)
		return
	}
	n, err := h.Q.DeleteMarker(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "marker not found")
		return
	}
	runID := uuidString(existing.RunID)
	h.publish(runID, markerDeleteEvent{Type: "marker.deleted", RunID: runID, MarkerID: uuidString(id)})
	writeNoContent(w)
}
