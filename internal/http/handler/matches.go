package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/f0reachARR/soiree/internal/db/sqlc"
)

type Matches struct {
	Q *sqlc.Queries
}

type matchDTO struct {
	ID           string     `json:"id"`
	TournamentID string     `json:"tournamentId"`
	TeamAID      string     `json:"teamAId"`
	TeamBID      string     `json:"teamBId"`
	ScheduledAt  *time.Time `json:"scheduledAt"`
	CreatedAt    time.Time  `json:"createdAt"`
}

func toMatchDTO(m sqlc.Match) matchDTO {
	return matchDTO{
		ID:           uuidString(m.ID),
		TournamentID: uuidString(m.TournamentID),
		TeamAID:      uuidString(m.TeamAID),
		TeamBID:      uuidString(m.TeamBID),
		ScheduledAt:  timeOrNil(m.ScheduledAt),
		CreatedAt:    m.CreatedAt.Time,
	}
}

type createMatchRequest struct {
	TournamentID string     `json:"tournamentId"`
	TeamAID      string     `json:"teamAId"`
	TeamBID      string     `json:"teamBId"`
	ScheduledAt  *time.Time `json:"scheduledAt"`
}

type updateMatchRequest struct {
	TeamAID     *string             `json:"teamAId"`
	TeamBID     *string             `json:"teamBId"`
	ScheduledAt Optional[time.Time] `json:"scheduledAt"`
}

type matchListResponse struct {
	Data       []matchDTO `json:"data"`
	Pagination pageOut    `json:"pagination"`
}

func (h *Matches) List(w http.ResponseWriter, r *http.Request) {
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
	params := sqlc.ListMatchesPageParams{
		TournamentID:    tournamentID,
		Limit:           limit + 1,
		CursorCreatedAt: cursorAt,
		CursorID:        cursorID,
	}
	rows, err := h.Q.ListMatchesPage(r.Context(), params)
	if err != nil {
		internalError(w, err)
		return
	}
	page, pg := paginate(rows, limit, func(m sqlc.Match) string {
		return encodeCursor(m.CreatedAt.Time, m.ID)
	})
	out := make([]matchDTO, len(page))
	for i, m := range page {
		out[i] = toMatchDTO(m)
	}
	writeJSON(w, http.StatusOK, matchListResponse{Data: out, Pagination: pg})
}

func (h *Matches) Create(w http.ResponseWriter, r *http.Request) {
	var req createMatchRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	tID, err := parseUUIDParam(req.TournamentID)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid tournamentId", nil)
		return
	}
	aID, err := parseUUIDParam(req.TeamAID)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid teamAId", nil)
		return
	}
	bID, err := parseUUIDParam(req.TeamBID)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid teamBId", nil)
		return
	}
	if aID == bID {
		writeError(w, http.StatusUnprocessableEntity, "validation", "teamAId and teamBId must differ", nil)
		return
	}
	m, err := h.Q.CreateMatch(r.Context(), sqlc.CreateMatchParams{
		TournamentID: tID,
		TeamAID:      aID,
		TeamBID:      bID,
		ScheduledAt:  timestamptz(req.ScheduledAt),
	})
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toMatchDTO(m))
}

func (h *Matches) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "matchId"))
	if err != nil {
		badRequest(w, "invalid matchId")
		return
	}
	m, err := h.Q.GetMatch(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "match not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toMatchDTO(m))
}

func (h *Matches) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "matchId"))
	if err != nil {
		badRequest(w, "invalid matchId")
		return
	}
	var req updateMatchRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	params := sqlc.UpdateMatchParams{ID: id}
	if req.TeamAID != nil {
		a, err := parseUUIDParam(*req.TeamAID)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "validation", "invalid teamAId", nil)
			return
		}
		params.TeamAID = a
	}
	if req.TeamBID != nil {
		b, err := parseUUIDParam(*req.TeamBID)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "validation", "invalid teamBId", nil)
			return
		}
		params.TeamBID = b
	}
	if req.ScheduledAt.Set {
		params.ScheduledAtSet = true
		if !req.ScheduledAt.Null {
			params.ScheduledAt = pgtypeTimestamptz(req.ScheduledAt.Value)
		}
	}
	m, err := h.Q.UpdateMatch(r.Context(), params)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "match not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toMatchDTO(m))
}

func (h *Matches) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "matchId"))
	if err != nil {
		badRequest(w, "invalid matchId")
		return
	}
	n, err := h.Q.DeleteMatch(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "match not found")
		return
	}
	writeNoContent(w)
}
