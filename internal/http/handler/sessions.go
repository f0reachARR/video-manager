package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

type Sessions struct {
	Q *sqlc.Queries
}

type sessionDTO struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	StartedAt    *time.Time `json:"startedAt"`
	EndedAt      *time.Time `json:"endedAt"`
	Location     *string    `json:"location"`
	ModeHint     string     `json:"modeHint"`
	TournamentID *string    `json:"tournamentId"`
	CreatedAt    time.Time  `json:"createdAt"`
}

func toSessionDTO(s sqlc.Session) sessionDTO {
	var tournamentID *string
	if s.TournamentID.Valid {
		v := uuidString(s.TournamentID)
		tournamentID = &v
	}
	return sessionDTO{
		ID:           uuidString(s.ID),
		Name:         s.Name,
		StartedAt:    timeOrNil(s.StartedAt),
		EndedAt:      timeOrNil(s.EndedAt),
		Location:     s.Location,
		ModeHint:     string(s.ModeHint),
		TournamentID: tournamentID,
		CreatedAt:    s.CreatedAt.Time,
	}
}

type createSessionRequest struct {
	Name         string     `json:"name"`
	StartedAt    *time.Time `json:"startedAt"`
	EndedAt      *time.Time `json:"endedAt"`
	Location     *string    `json:"location"`
	ModeHint     *string    `json:"modeHint"`
	TournamentID *string    `json:"tournamentId"`
}

type updateSessionRequest struct {
	Name         *string             `json:"name"`
	StartedAt    Optional[time.Time] `json:"startedAt"`
	EndedAt      Optional[time.Time] `json:"endedAt"`
	Location     Optional[string]    `json:"location"`
	ModeHint     *string             `json:"modeHint"`
	TournamentID Optional[string]    `json:"tournamentId"`
}

type sessionListResponse struct {
	Data       []sessionDTO `json:"data"`
	Pagination pageOut      `json:"pagination"`
}

func parseModeHint(s string) (sqlc.SessionModeHint, bool) {
	v := sqlc.SessionModeHint(s)
	switch v {
	case sqlc.SessionModeHintPractice, sqlc.SessionModeHintPreMatch:
		return v, true
	}
	return "", false
}

func (h *Sessions) List(w http.ResponseWriter, r *http.Request) {
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
	params := sqlc.ListSessionsPageParams{
		Limit:           limit + 1,
		CursorCreatedAt: cursorAt,
		CursorID:        cursorID,
	}
	if v := r.URL.Query().Get("modeHint"); v != "" {
		mh, ok := parseModeHint(v)
		if !ok {
			badRequest(w, "invalid modeHint")
			return
		}
		params.ModeHint = sqlc.NullSessionModeHint{SessionModeHint: mh, Valid: true}
	}
	if v := r.URL.Query().Get("tournamentId"); v != "" {
		id, err := parseUUIDParam(v)
		if err != nil {
			badRequest(w, "invalid tournamentId")
			return
		}
		params.TournamentID = id
	}
	if v := r.URL.Query().Get("startedFrom"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			badRequest(w, "invalid startedFrom")
			return
		}
		params.StartedFrom = timestamptz(&t)
	}
	if v := r.URL.Query().Get("startedTo"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			badRequest(w, "invalid startedTo")
			return
		}
		params.StartedTo = timestamptz(&t)
	}
	rows, err := h.Q.ListSessionsPage(r.Context(), params)
	if err != nil {
		internalError(w, err)
		return
	}
	page, pg := paginate(rows, limit, func(s sqlc.Session) string {
		return encodeCursor(s.CreatedAt.Time, s.ID)
	})
	out := make([]sessionDTO, len(page))
	for i, s := range page {
		out[i] = toSessionDTO(s)
	}
	writeJSON(w, http.StatusOK, sessionListResponse{Data: out, Pagination: pg})
}

func (h *Sessions) Create(w http.ResponseWriter, r *http.Request) {
	var req createSessionRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "name is required", nil)
		return
	}
	mode := sqlc.SessionModeHintPractice
	if req.ModeHint != nil {
		mh, ok := parseModeHint(*req.ModeHint)
		if !ok {
			writeError(w, http.StatusUnprocessableEntity, "validation", "invalid modeHint", nil)
			return
		}
		mode = mh
	}
	tournamentID, err := nullableUUID(req.TournamentID)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid tournamentId", nil)
		return
	}
	s, err := h.Q.CreateSession(r.Context(), sqlc.CreateSessionParams{
		Name:         req.Name,
		StartedAt:    timestamptz(req.StartedAt),
		EndedAt:      timestamptz(req.EndedAt),
		Location:     req.Location,
		ModeHint:     mode,
		TournamentID: tournamentID,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toSessionDTO(s))
}

func (h *Sessions) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "sessionId"))
	if err != nil {
		badRequest(w, "invalid sessionId")
		return
	}
	s, err := h.Q.GetSession(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "session not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toSessionDTO(s))
}

func (h *Sessions) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "sessionId"))
	if err != nil {
		badRequest(w, "invalid sessionId")
		return
	}
	var req updateSessionRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	params := sqlc.UpdateSessionParams{ID: id, Name: req.Name}
	if req.StartedAt.Set {
		params.StartedAtSet = true
		if !req.StartedAt.Null {
			params.StartedAt = pgtypeTimestamptz(req.StartedAt.Value)
		}
	}
	if req.EndedAt.Set {
		params.EndedAtSet = true
		if !req.EndedAt.Null {
			params.EndedAt = pgtypeTimestamptz(req.EndedAt.Value)
		}
	}
	if req.Location.Set {
		params.LocationSet = true
		if !req.Location.Null {
			v := req.Location.Value
			params.Location = &v
		}
	}
	if req.ModeHint != nil {
		mh, ok := parseModeHint(*req.ModeHint)
		if !ok {
			writeError(w, http.StatusUnprocessableEntity, "validation", "invalid modeHint", nil)
			return
		}
		params.ModeHint = sqlc.NullSessionModeHint{SessionModeHint: mh, Valid: true}
	}
	if req.TournamentID.Set {
		params.TournamentIDSet = true
		if !req.TournamentID.Null {
			id, err := parseUUIDParam(req.TournamentID.Value)
			if err != nil {
				writeError(w, http.StatusUnprocessableEntity, "validation", "invalid tournamentId", nil)
				return
			}
			params.TournamentID = id
		}
	}
	s, err := h.Q.UpdateSession(r.Context(), params)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "session not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toSessionDTO(s))
}

func (h *Sessions) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "sessionId"))
	if err != nil {
		badRequest(w, "invalid sessionId")
		return
	}
	n, err := h.Q.DeleteSession(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "session not found")
		return
	}
	writeNoContent(w)
}
