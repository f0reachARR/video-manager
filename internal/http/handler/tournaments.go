package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

type Tournaments struct {
	Q *sqlc.Queries
}

type tournamentDTO struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	StartDate *string   `json:"startDate"`
	EndDate   *string   `json:"endDate"`
	CreatedAt time.Time `json:"createdAt"`
}

const dateLayout = "2006-01-02"

func dateOrNil(d pgtype.Date) *string {
	if !d.Valid {
		return nil
	}
	s := d.Time.Format(dateLayout)
	return &s
}

func parseDate(s *string) (pgtype.Date, error) {
	if s == nil || *s == "" {
		return pgtype.Date{}, nil
	}
	t, err := time.Parse(dateLayout, *s)
	if err != nil {
		return pgtype.Date{}, err
	}
	return pgtype.Date{Time: t, Valid: true}, nil
}

func toTournamentDTO(t sqlc.Tournament) tournamentDTO {
	return tournamentDTO{
		ID:        uuidString(t.ID),
		Name:      t.Name,
		StartDate: dateOrNil(t.StartDate),
		EndDate:   dateOrNil(t.EndDate),
		CreatedAt: t.CreatedAt.Time,
	}
}

type createTournamentRequest struct {
	Name      string  `json:"name"`
	StartDate *string `json:"startDate"`
	EndDate   *string `json:"endDate"`
}

type updateTournamentRequest struct {
	Name      *string          `json:"name"`
	StartDate Optional[string] `json:"startDate"`
	EndDate   Optional[string] `json:"endDate"`
}

type tournamentListResponse struct {
	Data       []tournamentDTO `json:"data"`
	Pagination pageOut         `json:"pagination"`
}

func (h *Tournaments) List(w http.ResponseWriter, r *http.Request) {
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
	rows, err := h.Q.ListTournamentsPage(r.Context(), sqlc.ListTournamentsPageParams{
		Limit:           limit + 1,
		CursorCreatedAt: cursorAt,
		CursorID:        cursorID,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	page, pg := paginate(rows, limit, func(t sqlc.Tournament) string {
		return encodeCursor(t.CreatedAt.Time, t.ID)
	})
	out := make([]tournamentDTO, len(page))
	for i, t := range page {
		out[i] = toTournamentDTO(t)
	}
	writeJSON(w, http.StatusOK, tournamentListResponse{Data: out, Pagination: pg})
}

func (h *Tournaments) Create(w http.ResponseWriter, r *http.Request) {
	var req createTournamentRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "name is required", nil)
		return
	}
	start, err := parseDate(req.StartDate)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid startDate", nil)
		return
	}
	end, err := parseDate(req.EndDate)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid endDate", nil)
		return
	}
	t, err := h.Q.CreateTournament(r.Context(), sqlc.CreateTournamentParams{
		Name: req.Name, StartDate: start, EndDate: end,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toTournamentDTO(t))
}

func (h *Tournaments) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "tournamentId"))
	if err != nil {
		badRequest(w, "invalid tournamentId")
		return
	}
	t, err := h.Q.GetTournament(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "tournament not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toTournamentDTO(t))
}

func (h *Tournaments) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "tournamentId"))
	if err != nil {
		badRequest(w, "invalid tournamentId")
		return
	}
	var req updateTournamentRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	params := sqlc.UpdateTournamentParams{ID: id, Name: req.Name}
	if req.StartDate.Set {
		params.StartDateSet = true
		if !req.StartDate.Null {
			d, err := parseDate(&req.StartDate.Value)
			if err != nil {
				writeError(w, http.StatusUnprocessableEntity, "validation", "invalid startDate", nil)
				return
			}
			params.StartDate = d
		}
	}
	if req.EndDate.Set {
		params.EndDateSet = true
		if !req.EndDate.Null {
			d, err := parseDate(&req.EndDate.Value)
			if err != nil {
				writeError(w, http.StatusUnprocessableEntity, "validation", "invalid endDate", nil)
				return
			}
			params.EndDate = d
		}
	}
	t, err := h.Q.UpdateTournament(r.Context(), params)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "tournament not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toTournamentDTO(t))
}

func (h *Tournaments) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "tournamentId"))
	if err != nil {
		badRequest(w, "invalid tournamentId")
		return
	}
	n, err := h.Q.DeleteTournament(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "tournament not found")
		return
	}
	writeNoContent(w)
}
