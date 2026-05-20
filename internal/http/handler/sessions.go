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

// candidateGapThreshold is the spec-defined 30 minute Session adjacency gap.
// Adjacent (non-containing) sessions farther than this from the video are
// excluded; sessions that contain the video are returned unconditionally.
const candidateGapThreshold = 30 * time.Minute

type sessionCandidateDTO struct {
	Type          string      `json:"type"`
	Session       *sessionDTO `json:"session,omitempty"`
	GapSec        *int32      `json:"gapSec"`
	SuggestedName *string     `json:"suggestedName,omitempty"`
}

type sessionCandidateListResponse struct {
	Data []sessionCandidateDTO `json:"data"`
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

func (h *Sessions) Candidates(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("videoId")
	if q == "" {
		badRequest(w, "videoId is required")
		return
	}
	videoID, err := parseUUIDParam(q)
	if err != nil {
		badRequest(w, "invalid videoId")
		return
	}
	video, err := h.Q.GetVideo(r.Context(), videoID)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "video not found")
			return
		}
		internalError(w, err)
		return
	}
	if !video.RecordedAt.Valid {
		// Without recorded_at we can only propose a new session.
		writeJSON(w, http.StatusOK, sessionCandidateListResponse{
			Data: []sessionCandidateDTO{newSessionCandidate(time.Time{}, video)},
		})
		return
	}

	recordedAt := video.RecordedAt.Time
	var durationSec int32
	if video.DurationSec != nil {
		durationSec = *video.DurationSec
	}
	videoEnd := recordedAt.Add(time.Duration(durationSec) * time.Second)

	// The SQL bounds the result by interval overlap against [videoStart-gap,
	// videoEnd+gap] and treats open-ended sessions as extending to +infinity,
	// so containing sessions match regardless of how old their started_at is.
	// We still re-check gap in Go to populate gapSec for the UI.
	sessions, err := h.Q.ListSessionCandidatesForVideo(r.Context(), sqlc.ListSessionCandidatesForVideoParams{
		WindowStart: pgtypeTimestamptz(recordedAt.Add(-candidateGapThreshold)),
		WindowEnd:   pgtypeTimestamptz(videoEnd.Add(candidateGapThreshold)),
	})
	if err != nil {
		internalError(w, err)
		return
	}

	out := make([]sessionCandidateDTO, 0, len(sessions)+1)
	for _, s := range sessions {
		gap := computeSessionGap(s, recordedAt, videoEnd)
		dto := toSessionDTO(s)
		gapSec := int32(gap / time.Second)
		out = append(out, sessionCandidateDTO{
			Type:    "existing",
			Session: &dto,
			GapSec:  &gapSec,
		})
	}
	out = append(out, newSessionCandidate(recordedAt, video))
	writeJSON(w, http.StatusOK, sessionCandidateListResponse{Data: out})
}

func computeSessionGap(s sqlc.Session, videoStart, videoEnd time.Time) time.Duration {
	if !s.StartedAt.Valid {
		return time.Duration(1 << 62) // effectively infinity
	}
	sessStart := s.StartedAt.Time

	// A session without ended_at is treated as still ongoing — any video at or
	// after sessStart is considered "inside" the session (gap=0). Without this
	// the gap was computed against sessEnd = sessStart, which meant a Session
	// created with only started_at would reject every video taken more than
	// 30 minutes later, even though the user clearly intends it to span the
	// rest of the practice day.
	if !s.EndedAt.Valid {
		if videoEnd.Before(sessStart) {
			return sessStart.Sub(videoEnd)
		}
		return 0
	}

	sessEnd := s.EndedAt.Time
	switch {
	case videoEnd.Before(sessStart):
		return sessStart.Sub(videoEnd)
	case videoStart.After(sessEnd):
		return videoStart.Sub(sessEnd)
	default:
		return 0 // overlap
	}
}

func newSessionCandidate(recordedAt time.Time, _ sqlc.Video) sessionCandidateDTO {
	name := "新規 Session"
	if !recordedAt.IsZero() {
		name = "Session " + recordedAt.Format("2006-01-02 15:04")
	}
	return sessionCandidateDTO{Type: "new", SuggestedName: &name}
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
