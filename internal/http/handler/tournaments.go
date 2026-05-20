package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

type Tournaments struct {
	Q    *sqlc.Queries
	Pool *pgxpool.Pool
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

// ---------- Tournament <-> Team / Robot links (P0) ----------

type tournamentTeamListResponse struct {
	Data []teamDTO `json:"data"`
}

type tournamentRobotListResponse struct {
	Data []robotDTO `json:"data"`
}

type replaceTournamentTeamsRequest struct {
	TeamIDs []string `json:"teamIds"`
}

type replaceTournamentRobotsRequest struct {
	RobotIDs []string `json:"robotIds"`
}

func (h *Tournaments) tournamentExists(ctx context.Context, id pgtype.UUID) (bool, error) {
	if _, err := h.Q.GetTournament(ctx, id); err != nil {
		if isNoRows(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (h *Tournaments) ListTeams(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "tournamentId"))
	if err != nil {
		badRequest(w, "invalid tournamentId")
		return
	}
	ok, err := h.tournamentExists(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if !ok {
		notFound(w, "tournament not found")
		return
	}
	rows, err := h.Q.ListTeamsByTournament(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	out := make([]teamDTO, len(rows))
	for i, t := range rows {
		out[i] = toTeamDTO(t)
	}
	writeJSON(w, http.StatusOK, tournamentTeamListResponse{Data: out})
}

func (h *Tournaments) ReplaceTeams(w http.ResponseWriter, r *http.Request) {
	if h.Pool == nil {
		internalError(w, errMissingPool)
		return
	}
	id, err := parseUUIDParam(chi.URLParam(r, "tournamentId"))
	if err != nil {
		badRequest(w, "invalid tournamentId")
		return
	}
	var req replaceTournamentTeamsRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	teamIDs, err := parseUUIDList(req.TeamIDs)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid teamIds: "+err.Error(), nil)
		return
	}

	ok, err := h.tournamentExists(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if !ok {
		notFound(w, "tournament not found")
		return
	}

	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		internalError(w, err)
		return
	}
	defer tx.Rollback(context.Background())
	qtx := h.Q.WithTx(tx)

	// teams in the set ∆: clear-then-insert is simplest. tournament_robots
	// have ON DELETE CASCADE on robots only; we must drop entries whose robot
	// belongs to a team we just removed, so re-validate after re-inserting.
	if err := qtx.ClearTournamentTeams(r.Context(), id); err != nil {
		internalError(w, err)
		return
	}
	for _, tid := range teamIDs {
		if err := qtx.AddTournamentTeam(r.Context(), sqlc.AddTournamentTeamParams{TournamentID: id, TeamID: tid}); err != nil {
			if isFKViolation(err) {
				writeError(w, http.StatusUnprocessableEntity, "validation", "team not found", nil)
				return
			}
			internalError(w, err)
			return
		}
	}

	// Robots whose team is no longer participating must be dropped from
	// tournament_robots. Re-fetch the remaining robot links and clear any
	// orphans in this same tx.
	remainingRobots, err := qtx.ListRobotsByTournament(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	allowedTeams := make(map[[16]byte]struct{}, len(teamIDs))
	for _, t := range teamIDs {
		allowedTeams[t.Bytes] = struct{}{}
	}
	for _, rb := range remainingRobots {
		if _, ok := allowedTeams[rb.TeamID.Bytes]; ok {
			continue
		}
		if _, err := qtx.RemoveTournamentRobot(r.Context(), sqlc.RemoveTournamentRobotParams{TournamentID: id, RobotID: rb.ID}); err != nil {
			internalError(w, err)
			return
		}
	}

	rows, err := qtx.ListTeamsByTournament(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		internalError(w, err)
		return
	}
	out := make([]teamDTO, len(rows))
	for i, t := range rows {
		out[i] = toTeamDTO(t)
	}
	writeJSON(w, http.StatusOK, tournamentTeamListResponse{Data: out})
}

func (h *Tournaments) ListRobots(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "tournamentId"))
	if err != nil {
		badRequest(w, "invalid tournamentId")
		return
	}
	ok, err := h.tournamentExists(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if !ok {
		notFound(w, "tournament not found")
		return
	}
	rows, err := h.Q.ListRobotsByTournament(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	out := make([]robotDTO, len(rows))
	for i, rb := range rows {
		out[i] = toRobotDTO(rb)
	}
	writeJSON(w, http.StatusOK, tournamentRobotListResponse{Data: out})
}

func (h *Tournaments) ReplaceRobots(w http.ResponseWriter, r *http.Request) {
	if h.Pool == nil {
		internalError(w, errMissingPool)
		return
	}
	id, err := parseUUIDParam(chi.URLParam(r, "tournamentId"))
	if err != nil {
		badRequest(w, "invalid tournamentId")
		return
	}
	var req replaceTournamentRobotsRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	robotIDs, err := parseUUIDList(req.RobotIDs)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid robotIds: "+err.Error(), nil)
		return
	}

	ok, err := h.tournamentExists(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if !ok {
		notFound(w, "tournament not found")
		return
	}

	// A2 制約: 各ロボットの team が tournament_teams に居ること。
	if len(robotIDs) > 0 {
		teamRows, err := h.Q.ListTournamentRobotsTeamIDs(r.Context(), robotIDs)
		if err != nil {
			internalError(w, err)
			return
		}
		if len(teamRows) != len(robotIDs) {
			writeError(w, http.StatusUnprocessableEntity, "validation", "robot not found", nil)
			return
		}
		participating, err := h.Q.ListTeamsByTournament(r.Context(), id)
		if err != nil {
			internalError(w, err)
			return
		}
		allowed := make(map[[16]byte]struct{}, len(participating))
		for _, t := range participating {
			allowed[t.ID.Bytes] = struct{}{}
		}
		for _, row := range teamRows {
			if _, ok := allowed[row.TeamID.Bytes]; !ok {
				writeError(w, http.StatusUnprocessableEntity, "validation",
					"robot's team is not a participant of this tournament", nil)
				return
			}
		}
	}

	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		internalError(w, err)
		return
	}
	defer tx.Rollback(context.Background())
	qtx := h.Q.WithTx(tx)

	if err := qtx.ClearTournamentRobots(r.Context(), id); err != nil {
		internalError(w, err)
		return
	}
	for _, rid := range robotIDs {
		if err := qtx.AddTournamentRobot(r.Context(), sqlc.AddTournamentRobotParams{TournamentID: id, RobotID: rid}); err != nil {
			internalError(w, err)
			return
		}
	}
	rows, err := qtx.ListRobotsByTournament(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		internalError(w, err)
		return
	}
	out := make([]robotDTO, len(rows))
	for i, rb := range rows {
		out[i] = toRobotDTO(rb)
	}
	writeJSON(w, http.StatusOK, tournamentRobotListResponse{Data: out})
}

// parseUUIDList turns ["uuid", ...] into pgtype.UUID slice, deduping by value.
func parseUUIDList(in []string) ([]pgtype.UUID, error) {
	out := make([]pgtype.UUID, 0, len(in))
	seen := make(map[[16]byte]struct{}, len(in))
	for _, s := range in {
		u, err := uuid.Parse(s)
		if err != nil {
			return nil, err
		}
		if _, dup := seen[u]; dup {
			continue
		}
		seen[u] = struct{}{}
		out = append(out, pgtype.UUID{Bytes: u, Valid: true})
	}
	return out, nil
}
