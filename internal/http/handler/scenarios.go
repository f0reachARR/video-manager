package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

type Scenarios struct {
	Q *sqlc.Queries
}

type scenarioDTO struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
}

func toScenarioDTO(s sqlc.Scenario) scenarioDTO {
	return scenarioDTO{
		ID:          uuidString(s.ID),
		Name:        s.Name,
		Description: s.Description,
		CreatedAt:   s.CreatedAt.Time,
	}
}

type createScenarioRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
}

type updateScenarioRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

type scenarioListResponse struct {
	Data       []scenarioDTO `json:"data"`
	Pagination pageOut       `json:"pagination"`
}

func (h *Scenarios) List(w http.ResponseWriter, r *http.Request) {
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
	rows, err := h.Q.ListScenariosPage(r.Context(), sqlc.ListScenariosPageParams{
		Limit:           limit + 1,
		CursorCreatedAt: cursorAt,
		CursorID:        cursorID,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	page, pg := paginate(rows, limit, func(s sqlc.Scenario) string {
		return encodeCursor(s.CreatedAt.Time, s.ID)
	})
	out := make([]scenarioDTO, len(page))
	for i, s := range page {
		out[i] = toScenarioDTO(s)
	}
	writeJSON(w, http.StatusOK, scenarioListResponse{Data: out, Pagination: pg})
}

func (h *Scenarios) Create(w http.ResponseWriter, r *http.Request) {
	var req createScenarioRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "name is required", nil)
		return
	}
	desc := ""
	if req.Description != nil {
		desc = *req.Description
	}
	s, err := h.Q.CreateScenario(r.Context(), sqlc.CreateScenarioParams{Name: req.Name, Description: desc})
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toScenarioDTO(s))
}

func (h *Scenarios) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "scenarioId"))
	if err != nil {
		badRequest(w, "invalid scenarioId")
		return
	}
	s, err := h.Q.GetScenario(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "scenario not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toScenarioDTO(s))
}

func (h *Scenarios) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "scenarioId"))
	if err != nil {
		badRequest(w, "invalid scenarioId")
		return
	}
	var req updateScenarioRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	s, err := h.Q.UpdateScenario(r.Context(), sqlc.UpdateScenarioParams{
		ID:          id,
		Name:        req.Name,
		Description: req.Description,
	})
	if err != nil {
		if isNoRows(err) {
			notFound(w, "scenario not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toScenarioDTO(s))
}

func (h *Scenarios) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "scenarioId"))
	if err != nil {
		badRequest(w, "invalid scenarioId")
		return
	}
	n, err := h.Q.DeleteScenario(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "scenario not found")
		return
	}
	writeNoContent(w)
}
