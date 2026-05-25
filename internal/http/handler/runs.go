package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

type Runs struct {
	Q *sqlc.Queries
}

type runVideoDTO struct {
	ID                  string `json:"id"`
	RunID               string `json:"runId"`
	VideoID             string `json:"videoId"`
	VideoOffsetStartSec int32  `json:"videoOffsetStartSec"`
	VideoOffsetEndSec   int32  `json:"videoOffsetEndSec"`
	RunOffsetSec        int32  `json:"runOffsetSec"`
	AngleLabel          string `json:"angleLabel"`
}

func toRunVideoDTO(rv sqlc.RunVideo) runVideoDTO {
	return runVideoDTO{
		ID:                  uuidString(rv.ID),
		RunID:               uuidString(rv.RunID),
		VideoID:             uuidString(rv.VideoID),
		VideoOffsetStartSec: rv.VideoOffsetStart,
		VideoOffsetEndSec:   rv.VideoOffsetEnd,
		RunOffsetSec:        rv.RunOffsetSec,
		AngleLabel:          rv.AngleLabel,
	}
}

type runDTO struct {
	ID           string        `json:"id"`
	TournamentID string        `json:"tournamentId"`
	SessionID    string        `json:"sessionId"`
	TeamID       string        `json:"teamId"`
	RobotID      string        `json:"robotId"`
	ScenarioID   string        `json:"scenarioId"`
	MatchID      *string       `json:"matchId"`
	StartedAt    time.Time     `json:"startedAt"`
	EndedAt      time.Time     `json:"endedAt"`
	DurationSec  int32         `json:"durationSec"`
	Score        *float64      `json:"score"`
	Memo         string        `json:"memo"`
	Videos       []runVideoDTO `json:"videos,omitempty"`
	TagIDs       []string      `json:"tagIds"`
	CreatedAt    time.Time     `json:"createdAt"`
}

func toRunDTO(r sqlc.Run, videos []sqlc.RunVideo, tagIDs []pgtype.UUID) runDTO {
	var matchID *string
	if r.MatchID.Valid {
		s := uuidString(r.MatchID)
		matchID = &s
	}
	out := runDTO{
		ID:           uuidString(r.ID),
		TournamentID: uuidString(r.TournamentID),
		SessionID:    uuidString(r.SessionID),
		TeamID:       uuidString(r.TeamID),
		RobotID:      uuidString(r.RobotID),
		ScenarioID:   uuidString(r.ScenarioID),
		MatchID:      matchID,
		StartedAt:    r.StartedAt.Time,
		EndedAt:      r.StartedAt.Time.Add(time.Duration(r.DurationSec) * time.Second),
		DurationSec:  r.DurationSec,
		Score:        r.Score,
		Memo:         r.Memo,
		TagIDs:       make([]string, 0, len(tagIDs)),
		CreatedAt:    r.CreatedAt.Time,
	}
	if videos != nil {
		out.Videos = make([]runVideoDTO, len(videos))
		for i, v := range videos {
			out.Videos[i] = toRunVideoDTO(v)
		}
	}
	for _, t := range tagIDs {
		out.TagIDs = append(out.TagIDs, uuidString(t))
	}
	return out
}

type createRunRequest struct {
	SessionID   string    `json:"sessionId"`
	TeamID      string    `json:"teamId"`
	RobotID     string    `json:"robotId"`
	ScenarioID  string    `json:"scenarioId"`
	MatchID     *string   `json:"matchId"`
	StartedAt   time.Time `json:"startedAt"`
	DurationSec *int32    `json:"durationSec"`
	Score       *float64  `json:"score"`
	Memo        *string   `json:"memo"`
	TagIDs      []string  `json:"tagIds"`
	// When set, the new Run is created and these videos are attached in one
	// call. Used by the "multi-select videos → 作成 Run" flow on the Videos page.
	Videos []addRunVideoRequest `json:"videos"`
}

type updateRunRequest struct {
	RobotID     *string           `json:"robotId"`
	ScenarioID  *string           `json:"scenarioId"`
	MatchID     Optional[string]  `json:"matchId"`
	StartedAt   *time.Time        `json:"startedAt"`
	DurationSec *int32            `json:"durationSec"`
	Score       Optional[float64] `json:"score"`
	Memo        *string           `json:"memo"`
	TagIDs      *[]string         `json:"tagIds"`
}

type runListResponse struct {
	Data       []runDTO `json:"data"`
	Pagination pageOut  `json:"pagination"`
}

func (h *Runs) List(w http.ResponseWriter, r *http.Request) {
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
	params := sqlc.ListRunsPageParams{
		TournamentID:    tournamentID,
		Limit:           limit + 1,
		CursorCreatedAt: cursorAt,
		CursorID:        cursorID,
	}
	for _, key := range []string{"sessionId", "teamId", "robotId", "scenarioId", "matchId"} {
		v := r.URL.Query().Get(key)
		if v == "" {
			continue
		}
		id, err := parseUUIDParam(v)
		if err != nil {
			badRequest(w, "invalid "+key)
			return
		}
		switch key {
		case "sessionId":
			params.SessionID = id
		case "teamId":
			params.TeamID = id
		case "robotId":
			params.RobotID = id
		case "scenarioId":
			params.ScenarioID = id
		case "matchId":
			params.MatchID = id
		}
	}
	rows, err := h.Q.ListRunsPage(r.Context(), params)
	if err != nil {
		internalError(w, err)
		return
	}
	page, pg := paginate(rows, limit, func(rr sqlc.Run) string {
		return encodeCursor(rr.CreatedAt.Time, rr.ID)
	})

	out := make([]runDTO, 0, len(page))
	for _, rr := range page {
		tags, err := h.Q.ListRunTagsByRun(r.Context(), rr.ID)
		if err != nil {
			internalError(w, err)
			return
		}
		out = append(out, toRunDTO(rr, nil, tags))
	}
	writeJSON(w, http.StatusOK, runListResponse{Data: out, Pagination: pg})
}

func (h *Runs) Create(w http.ResponseWriter, r *http.Request) {
	var req createRunRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	sessionID, err := parseUUIDParam(req.SessionID)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid sessionId", nil)
		return
	}
	// Derive tournament_id from the session. Keeps the two in sync without
	// trusting the client to supply a matching pair.
	session, err := h.Q.GetSession(r.Context(), sessionID)
	if err != nil {
		if isNoRows(err) {
			writeError(w, http.StatusUnprocessableEntity, "validation", "session not found", nil)
			return
		}
		internalError(w, err)
		return
	}
	teamID, err := parseUUIDParam(req.TeamID)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid teamId", nil)
		return
	}
	robotID, err := parseUUIDParam(req.RobotID)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid robotId", nil)
		return
	}
	scenarioID, err := parseUUIDParam(req.ScenarioID)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid scenarioId", nil)
		return
	}
	matchID, err := nullableUUID(req.MatchID)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid matchId", nil)
		return
	}
	memo := ""
	if req.Memo != nil {
		memo = *req.Memo
	}
	duration := int32(0)
	if req.DurationSec != nil {
		duration = *req.DurationSec
	}
	if duration < 0 {
		writeError(w, http.StatusUnprocessableEntity, "validation", "durationSec must be >= 0", nil)
		return
	}
	run, err := h.Q.CreateRun(r.Context(), sqlc.CreateRunParams{
		TournamentID: session.TournamentID,
		SessionID:    sessionID,
		TeamID:       teamID,
		RobotID:      robotID,
		ScenarioID:   scenarioID,
		MatchID:      matchID,
		StartedAt:    pgtypeTimestamptz(req.StartedAt),
		Score:        req.Score,
		Memo:         memo,
		DurationSec:  duration,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	if err := h.applyTagIDs(r, run.ID, req.TagIDs); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", err.Error(), nil)
		return
	}
	// Optional bulk attach. Errors here are reported but don't roll back the
	// Run itself — failed angles can be retried via AddVideo. Videos must
	// belong to the same Session as the Run (or be unassigned, in which case
	// they get associated to this Run's Session implicitly is NOT done — the
	// caller is expected to assign first).
	var attached []sqlc.RunVideo
	for _, v := range req.Videos {
		videoID, err := parseUUIDParam(v.VideoID)
		if err != nil {
			continue
		}
		if v.VideoOffsetEndSec < v.VideoOffsetStartSec {
			continue
		}
		vid, err := h.Q.GetVideo(r.Context(), videoID)
		if err != nil {
			continue
		}
		if !vid.SessionID.Valid || vid.SessionID.Bytes != sessionID.Bytes {
			continue
		}
		angle := ""
		if v.AngleLabel != nil {
			angle = *v.AngleLabel
		}
		rv, err := h.Q.AddRunVideo(r.Context(), sqlc.AddRunVideoParams{
			RunID:            run.ID,
			VideoID:          videoID,
			VideoOffsetStart: v.VideoOffsetStartSec,
			VideoOffsetEnd:   v.VideoOffsetEndSec,
			RunOffsetSec:     v.RunOffsetSec,
			AngleLabel:       angle,
		})
		if err == nil {
			attached = append(attached, rv)
		}
	}
	tags, err := h.Q.ListRunTagsByRun(r.Context(), run.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toRunDTO(run, attached, tags))
}

func (h *Runs) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "runId"))
	if err != nil {
		badRequest(w, "invalid runId")
		return
	}
	run, err := h.Q.GetRun(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "run not found")
			return
		}
		internalError(w, err)
		return
	}
	videos, err := h.Q.ListRunVideosByRun(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	tags, err := h.Q.ListRunTagsByRun(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toRunDTO(run, videos, tags))
}

func (h *Runs) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "runId"))
	if err != nil {
		badRequest(w, "invalid runId")
		return
	}
	var req updateRunRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	params := sqlc.UpdateRunParams{ID: id, Memo: req.Memo}
	if req.RobotID != nil {
		rid, err := parseUUIDParam(*req.RobotID)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "validation", "invalid robotId", nil)
			return
		}
		params.RobotID = rid
	}
	if req.ScenarioID != nil {
		sid, err := parseUUIDParam(*req.ScenarioID)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "validation", "invalid scenarioId", nil)
			return
		}
		params.ScenarioID = sid
	}
	if req.MatchID.Set {
		params.MatchIDSet = true
		if !req.MatchID.Null {
			mid, err := parseUUIDParam(req.MatchID.Value)
			if err != nil {
				writeError(w, http.StatusUnprocessableEntity, "validation", "invalid matchId", nil)
				return
			}
			params.MatchID = mid
		}
	}
	if req.StartedAt != nil {
		params.StartedAt = pgtypeTimestamptz(*req.StartedAt)
	}
	if req.DurationSec != nil {
		if *req.DurationSec < 0 {
			writeError(w, http.StatusUnprocessableEntity, "validation", "durationSec must be >= 0", nil)
			return
		}
		params.DurationSec = req.DurationSec
	}
	if req.Score.Set {
		params.ScoreSet = true
		if !req.Score.Null {
			v := req.Score.Value
			params.Score = &v
		}
	}
	run, err := h.Q.UpdateRun(r.Context(), params)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "run not found")
			return
		}
		internalError(w, err)
		return
	}
	if req.TagIDs != nil {
		if err := h.applyTagIDs(r, run.ID, *req.TagIDs); err != nil {
			writeError(w, http.StatusUnprocessableEntity, "validation", err.Error(), nil)
			return
		}
	}
	videos, err := h.Q.ListRunVideosByRun(r.Context(), run.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	tags, err := h.Q.ListRunTagsByRun(r.Context(), run.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toRunDTO(run, videos, tags))
}

func (h *Runs) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "runId"))
	if err != nil {
		badRequest(w, "invalid runId")
		return
	}
	n, err := h.Q.DeleteRun(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "run not found")
		return
	}
	writeNoContent(w)
}

type addRunVideoRequest struct {
	VideoID             string  `json:"videoId"`
	VideoOffsetStartSec int32   `json:"videoOffsetStartSec"`
	VideoOffsetEndSec   int32   `json:"videoOffsetEndSec"`
	RunOffsetSec        int32   `json:"runOffsetSec"`
	AngleLabel          *string `json:"angleLabel"`
}

type updateRunVideoRequest struct {
	VideoOffsetStartSec *int32  `json:"videoOffsetStartSec"`
	VideoOffsetEndSec   *int32  `json:"videoOffsetEndSec"`
	RunOffsetSec        *int32  `json:"runOffsetSec"`
	AngleLabel          *string `json:"angleLabel"`
}

func (h *Runs) AddVideo(w http.ResponseWriter, r *http.Request) {
	runID, err := parseUUIDParam(chi.URLParam(r, "runId"))
	if err != nil {
		badRequest(w, "invalid runId")
		return
	}
	run, err := h.Q.GetRun(r.Context(), runID)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "run not found")
			return
		}
		internalError(w, err)
		return
	}
	var req addRunVideoRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	videoID, err := parseUUIDParam(req.VideoID)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "invalid videoId", nil)
		return
	}
	if req.VideoOffsetEndSec < req.VideoOffsetStartSec {
		writeError(w, http.StatusUnprocessableEntity, "validation", "end < start", nil)
		return
	}
	video, err := h.Q.GetVideo(r.Context(), videoID)
	if err != nil {
		if isNoRows(err) {
			writeError(w, http.StatusUnprocessableEntity, "validation", "video not found", nil)
			return
		}
		internalError(w, err)
		return
	}
	if !video.SessionID.Valid || video.SessionID.Bytes != run.SessionID.Bytes {
		writeError(w, http.StatusUnprocessableEntity, "session_mismatch", "video and run belong to different sessions", nil)
		return
	}
	angle := ""
	if req.AngleLabel != nil {
		angle = *req.AngleLabel
	}
	rv, err := h.Q.AddRunVideo(r.Context(), sqlc.AddRunVideoParams{
		RunID:            runID,
		VideoID:          videoID,
		VideoOffsetStart: req.VideoOffsetStartSec,
		VideoOffsetEnd:   req.VideoOffsetEndSec,
		RunOffsetSec:     req.RunOffsetSec,
		AngleLabel:       angle,
	})
	if err != nil {
		// likely unique conflict
		writeError(w, http.StatusConflict, "conflict", err.Error(), nil)
		return
	}
	writeJSON(w, http.StatusCreated, toRunVideoDTO(rv))
}

func (h *Runs) UpdateVideo(w http.ResponseWriter, r *http.Request) {
	rvID, err := parseUUIDParam(chi.URLParam(r, "runVideoId"))
	if err != nil {
		badRequest(w, "invalid runVideoId")
		return
	}
	var req updateRunVideoRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	rv, err := h.Q.UpdateRunVideo(r.Context(), sqlc.UpdateRunVideoParams{
		ID:               rvID,
		VideoOffsetStart: req.VideoOffsetStartSec,
		VideoOffsetEnd:   req.VideoOffsetEndSec,
		RunOffsetSec:     req.RunOffsetSec,
		AngleLabel:       req.AngleLabel,
	})
	if err != nil {
		if isNoRows(err) {
			notFound(w, "runVideo not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toRunVideoDTO(rv))
}

// RecommendedVideos returns videos uploaded against the same session that
// aren't yet attached to this Run. Useful for filling out angles.
func (h *Runs) RecommendedVideos(w http.ResponseWriter, r *http.Request) {
	runID, err := parseUUIDParam(chi.URLParam(r, "runId"))
	if err != nil {
		badRequest(w, "invalid runId")
		return
	}
	if _, err := h.Q.GetRun(r.Context(), runID); err != nil {
		if isNoRows(err) {
			notFound(w, "run not found")
			return
		}
		internalError(w, err)
		return
	}
	rows, err := h.Q.ListRecommendedVideosForRun(r.Context(), runID)
	if err != nil {
		internalError(w, err)
		return
	}
	out := make([]videoDTO, len(rows))
	for i, v := range rows {
		out[i] = toVideoDTO(v)
	}
	writeJSON(w, http.StatusOK, struct {
		Data []videoDTO `json:"data"`
	}{Data: out})
}

func (h *Runs) RemoveVideo(w http.ResponseWriter, r *http.Request) {
	rvID, err := parseUUIDParam(chi.URLParam(r, "runVideoId"))
	if err != nil {
		badRequest(w, "invalid runVideoId")
		return
	}
	n, err := h.Q.DeleteRunVideo(r.Context(), rvID)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "runVideo not found")
		return
	}
	writeNoContent(w)
}

func (h *Runs) applyTagIDs(r *http.Request, runID pgtype.UUID, tagIDs []string) error {
	if err := h.Q.ClearRunTags(r.Context(), runID); err != nil {
		return err
	}
	for _, raw := range tagIDs {
		id, err := parseUUIDParam(raw)
		if err != nil {
			return err
		}
		if err := h.Q.AddRunTag(r.Context(), sqlc.AddRunTagParams{RunID: runID, TagID: id}); err != nil {
			return err
		}
	}
	return nil
}
