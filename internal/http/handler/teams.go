package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

type Teams struct {
	Q *sqlc.Queries
}

type teamDTO struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	IsOwn     bool      `json:"isOwn"`
	CreatedAt time.Time `json:"createdAt"`
}

func toTeamDTO(t sqlc.Team) teamDTO {
	return teamDTO{
		ID:        uuidString(t.ID),
		Name:      t.Name,
		IsOwn:     t.IsOwn,
		CreatedAt: t.CreatedAt.Time,
	}
}

type createTeamRequest struct {
	Name  string `json:"name"`
	IsOwn *bool  `json:"isOwn"`
}

type updateTeamRequest struct {
	Name  *string `json:"name"`
	IsOwn *bool   `json:"isOwn"`
}

type teamListResponse struct {
	Data       []teamDTO `json:"data"`
	Pagination pageOut   `json:"pagination"`
}

func (h *Teams) List(w http.ResponseWriter, r *http.Request) {
	limit, err := limitFromQuery(r)
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	cursorAt, cursorID, err := decodeCursor(r.URL.Query().Get("cursor"))
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	rows, err := h.Q.ListTeamsPage(r.Context(), sqlc.ListTeamsPageParams{
		Limit:           limit + 1,
		CursorCreatedAt: cursorAt,
		CursorID:        cursorID,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	page, pg := paginate(rows, limit, func(t sqlc.Team) string {
		return encodeCursor(t.CreatedAt.Time, t.ID)
	})
	out := make([]teamDTO, len(page))
	for i, t := range page {
		out[i] = toTeamDTO(t)
	}
	writeJSON(w, http.StatusOK, teamListResponse{Data: out, Pagination: pg})
}

func (h *Teams) Create(w http.ResponseWriter, r *http.Request) {
	var req createTeamRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "name is required", nil)
		return
	}
	isOwn := false
	if req.IsOwn != nil {
		isOwn = *req.IsOwn
	}
	t, err := h.Q.CreateTeam(r.Context(), sqlc.CreateTeamParams{Name: req.Name, IsOwn: isOwn})
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toTeamDTO(t))
}

func (h *Teams) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "teamId"))
	if err != nil {
		badRequest(w, "invalid teamId")
		return
	}
	t, err := h.Q.GetTeam(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "team not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toTeamDTO(t))
}

func (h *Teams) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "teamId"))
	if err != nil {
		badRequest(w, "invalid teamId")
		return
	}
	var req updateTeamRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	t, err := h.Q.UpdateTeam(r.Context(), sqlc.UpdateTeamParams{
		ID:    id,
		Name:  req.Name,
		IsOwn: req.IsOwn,
	})
	if err != nil {
		if isNoRows(err) {
			notFound(w, "team not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toTeamDTO(t))
}

func (h *Teams) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "teamId"))
	if err != nil {
		badRequest(w, "invalid teamId")
		return
	}
	n, err := h.Q.DeleteTeam(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "team not found")
		return
	}
	writeNoContent(w)
}
