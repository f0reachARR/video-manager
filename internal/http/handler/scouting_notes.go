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
	TournamentID string    `json:"tournamentId"`
	TeamID       string    `json:"teamId"`
	PlainText    string    `json:"plainText"`
	UpdatedAt    time.Time `json:"updatedAt"`
	CreatedAt    time.Time `json:"createdAt"`
}

func toScoutingNoteDTO(n sqlc.ScoutingNote) scoutingNoteDTO {
	return scoutingNoteDTO{
		ID:           uuidString(n.ID),
		TournamentID: uuidString(n.TournamentID),
		TeamID:       uuidString(n.TeamID),
		PlainText:    n.PlainText,
		UpdatedAt:    n.UpdatedAt.Time,
		CreatedAt:    n.CreatedAt.Time,
	}
}

type scoutingNoteListResponse struct {
	Data []scoutingNoteDTO `json:"data"`
}

// ListByTournament returns every scouting note that belongs to a tournament.
// Notes are uniquely keyed by (tournament_id, team_id) so the consumer can
// look up a single team's note by teamId on the client side.
func (h *ScoutingNotes) ListByTournament(w http.ResponseWriter, r *http.Request) {
	tournamentID, err := parseUUIDParam(chi.URLParam(r, "tournamentId"))
	if err != nil {
		badRequest(w, "invalid tournamentId")
		return
	}
	if _, err := h.Q.GetTournament(r.Context(), tournamentID); err != nil {
		if isNoRows(err) {
			notFound(w, "tournament not found")
			return
		}
		internalError(w, err)
		return
	}
	rows, err := h.Q.ListScoutingNotesByTournament(r.Context(), tournamentID)
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

// GetByTeam fetches (or auto-creates) the note for one (tournament, team)
// pair. Upserting on read keeps the SPA simple: open the team page and the
// Hocuspocus document is guaranteed to exist.
func (h *ScoutingNotes) GetByTeam(w http.ResponseWriter, r *http.Request) {
	tournamentID, err := parseUUIDParam(chi.URLParam(r, "tournamentId"))
	if err != nil {
		badRequest(w, "invalid tournamentId")
		return
	}
	teamID, err := parseUUIDParam(chi.URLParam(r, "teamId"))
	if err != nil {
		badRequest(w, "invalid teamId")
		return
	}
	n, err := h.Q.GetScoutingNoteByTournamentAndTeam(r.Context(), sqlc.GetScoutingNoteByTournamentAndTeamParams{
		TournamentID: tournamentID,
		TeamID:       teamID,
	})
	if err == nil {
		writeJSON(w, http.StatusOK, toScoutingNoteDTO(n))
		return
	}
	if !isNoRows(err) {
		internalError(w, err)
		return
	}
	// Validate FKs so we 404 cleanly instead of letting the INSERT 500.
	if _, err := h.Q.GetTournament(r.Context(), tournamentID); err != nil {
		if isNoRows(err) {
			notFound(w, "tournament not found")
			return
		}
		internalError(w, err)
		return
	}
	if _, err := h.Q.GetTeam(r.Context(), teamID); err != nil {
		if isNoRows(err) {
			notFound(w, "team not found")
			return
		}
		internalError(w, err)
		return
	}
	created, err := h.Q.CreateScoutingNote(r.Context(), sqlc.CreateScoutingNoteParams{
		TournamentID: tournamentID,
		TeamID:       teamID,
	})
	if err != nil {
		// A race could insert before we did; re-read in that case.
		if strings.Contains(err.Error(), "duplicate key") ||
			strings.Contains(err.Error(), "23505") {
			n, err := h.Q.GetScoutingNoteByTournamentAndTeam(r.Context(), sqlc.GetScoutingNoteByTournamentAndTeamParams{
				TournamentID: tournamentID,
				TeamID:       teamID,
			})
			if err != nil {
				internalError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, toScoutingNoteDTO(n))
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toScoutingNoteDTO(created))
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
