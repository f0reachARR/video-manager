package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/f0reachARR/soiree/internal/db/sqlc"
)

type Robots struct {
	Q *sqlc.Queries
}

type robotDTO struct {
	ID             string    `json:"id"`
	TournamentID   string    `json:"tournamentId"`
	TeamID         string    `json:"teamId"`
	Name           string    `json:"name"`
	Version        string    `json:"version"`
	PrimaryImageID *string   `json:"primaryImageId"`
	CreatedAt      time.Time `json:"createdAt"`
}

func toRobotDTO(r sqlc.Robot) robotDTO {
	out := robotDTO{
		ID:           uuidString(r.ID),
		TournamentID: uuidString(r.TournamentID),
		TeamID:       uuidString(r.TeamID),
		Name:         r.Name,
		Version:      r.Version,
		CreatedAt:    r.CreatedAt.Time,
	}
	if r.PrimaryImageID.Valid {
		s := uuidString(r.PrimaryImageID)
		out.PrimaryImageID = &s
	}
	return out
}

type createRobotRequest struct {
	TournamentID string  `json:"tournamentId"`
	TeamID       string  `json:"teamId"`
	Name         string  `json:"name"`
	Version      *string `json:"version"`
}

type updateRobotRequest struct {
	Name    *string `json:"name"`
	Version *string `json:"version"`
}

type robotListResponse struct {
	Data       []robotDTO `json:"data"`
	Pagination pageOut    `json:"pagination"`
}

func (h *Robots) List(w http.ResponseWriter, r *http.Request) {
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
	tournamentID, err := requiredTournamentID(r)
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	params := sqlc.ListRobotsPageParams{
		TournamentID:    tournamentID,
		Limit:           limit + 1,
		CursorCreatedAt: cursorAt,
		CursorID:        cursorID,
	}
	if v := r.URL.Query().Get("teamId"); v != "" {
		id, err := parseUUIDParam(v)
		if err != nil {
			badRequest(w, "invalid teamId")
			return
		}
		params.TeamID = id
	}
	rows, err := h.Q.ListRobotsPage(r.Context(), params)
	if err != nil {
		internalError(w, err)
		return
	}
	page, pg := paginate(rows, limit, func(rb sqlc.Robot) string {
		return encodeCursor(rb.CreatedAt.Time, rb.ID)
	})
	out := make([]robotDTO, len(page))
	for i, rb := range page {
		out[i] = toRobotDTO(rb)
	}
	writeJSON(w, http.StatusOK, robotListResponse{Data: out, Pagination: pg})
}

func (h *Robots) Create(w http.ResponseWriter, r *http.Request) {
	var req createRobotRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "name is required", nil)
		return
	}
	tournamentID, err := parseUUIDParam(req.TournamentID)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid tournamentId", nil)
		return
	}
	teamID, err := parseUUIDParam(req.TeamID)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid teamId", nil)
		return
	}
	version := ""
	if req.Version != nil {
		version = *req.Version
	}
	rb, err := h.Q.CreateRobot(r.Context(), sqlc.CreateRobotParams{
		TournamentID: tournamentID,
		TeamID:       teamID,
		Name:         req.Name,
		Version:      version,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toRobotDTO(rb))
}

func (h *Robots) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "robotId"))
	if err != nil {
		badRequest(w, "invalid robotId")
		return
	}
	rb, err := h.Q.GetRobot(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "robot not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toRobotDTO(rb))
}

func (h *Robots) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "robotId"))
	if err != nil {
		badRequest(w, "invalid robotId")
		return
	}
	var req updateRobotRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	rb, err := h.Q.UpdateRobot(r.Context(), sqlc.UpdateRobotParams{
		ID:      id,
		Name:    req.Name,
		Version: req.Version,
	})
	if err != nil {
		if isNoRows(err) {
			notFound(w, "robot not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toRobotDTO(rb))
}

func (h *Robots) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "robotId"))
	if err != nil {
		badRequest(w, "invalid robotId")
		return
	}
	n, err := h.Q.DeleteRobot(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "robot not found")
		return
	}
	writeNoContent(w)
}
