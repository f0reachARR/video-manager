package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

type ScoutingNotes struct {
	Q *sqlc.Queries
}

type scoutingNoteDTO struct {
	ID           string    `json:"id"`
	MatchID      string    `json:"matchId"`
	TargetTeamID string    `json:"targetTeamId"`
	PlainText    string    `json:"plainText"`
	UpdatedAt    time.Time `json:"updatedAt"`
	CreatedAt    time.Time `json:"createdAt"`
}

func toScoutingNoteDTO(n sqlc.ScoutingNote) scoutingNoteDTO {
	return scoutingNoteDTO{
		ID:           uuidString(n.ID),
		MatchID:      uuidString(n.MatchID),
		TargetTeamID: uuidString(n.TargetTeamID),
		PlainText:    n.PlainText,
		UpdatedAt:    n.UpdatedAt.Time,
		CreatedAt:    n.CreatedAt.Time,
	}
}

type createScoutingNoteRequest struct {
	TargetTeamID string `json:"targetTeamId"`
}

type scoutingNoteListResponse struct {
	Data []scoutingNoteDTO `json:"data"`
}

func (h *ScoutingNotes) ListByMatch(w http.ResponseWriter, r *http.Request) {
	matchID, err := parseUUIDParam(chi.URLParam(r, "matchId"))
	if err != nil {
		badRequest(w, "invalid matchId")
		return
	}
	if _, err := h.Q.GetMatch(r.Context(), matchID); err != nil {
		if isNoRows(err) {
			notFound(w, "match not found")
			return
		}
		internalError(w, err)
		return
	}
	rows, err := h.Q.ListScoutingNotesByMatch(r.Context(), matchID)
	if err != nil {
		internalError(w, err)
		return
	}
	out := make([]scoutingNoteDTO, len(rows))
	for i, n := range rows {
		out[i] = toScoutingNoteDTO(n)
	}
	writeJSON(w, http.StatusOK, scoutingNoteListResponse{Data: out})
}

func (h *ScoutingNotes) Create(w http.ResponseWriter, r *http.Request) {
	matchID, err := parseUUIDParam(chi.URLParam(r, "matchId"))
	if err != nil {
		badRequest(w, "invalid matchId")
		return
	}
	if _, err := h.Q.GetMatch(r.Context(), matchID); err != nil {
		if isNoRows(err) {
			notFound(w, "match not found")
			return
		}
		internalError(w, err)
		return
	}
	var req createScoutingNoteRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	teamID, err := parseUUIDParam(req.TargetTeamID)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid targetTeamId", nil)
		return
	}
	n, err := h.Q.CreateScoutingNote(r.Context(), sqlc.CreateScoutingNoteParams{
		MatchID:      matchID,
		TargetTeamID: teamID,
	})
	if err != nil {
		// unique (match_id, target_team_id) violation surfaces as a pgconn
		// SQLSTATE 23505. Plain string check keeps the import surface small.
		if strings.Contains(err.Error(), "duplicate key") ||
			strings.Contains(err.Error(), "23505") {
			writeError(w, http.StatusConflict, "conflict",
				"scouting note for this match + team already exists", nil)
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toScoutingNoteDTO(n))
}

func (h *ScoutingNotes) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "noteId"))
	if err != nil {
		badRequest(w, "invalid noteId")
		return
	}
	n, err := h.Q.GetScoutingNote(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "scouting note not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toScoutingNoteDTO(n))
}

func (h *ScoutingNotes) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "noteId"))
	if err != nil {
		badRequest(w, "invalid noteId")
		return
	}
	n, err := h.Q.DeleteScoutingNote(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "scouting note not found")
		return
	}
	writeNoContent(w)
}
