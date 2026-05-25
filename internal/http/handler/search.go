package handler

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

// SearchRuns implements GET /search/runs. Cursor encoding mirrors the other
// resources but is sorted DESC by started_at to surface recent activity first.
func (h *Runs) Search(w http.ResponseWriter, r *http.Request) {
	limit, err := limitFromQuery(r)
	if err != nil {
		badRequest(w, err.Error())
		return
	}

	tournamentID, err := requiredTournamentID(r)
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	params := sqlc.SearchRunsParams{TournamentID: tournamentID, Limit: limit + 1}

	if v := r.URL.Query().Get("from"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			badRequest(w, "invalid from")
			return
		}
		params.From = pgtypeTimestamptz(t)
	}
	if v := r.URL.Query().Get("to"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			badRequest(w, "invalid to")
			return
		}
		params.To = pgtypeTimestamptz(t)
	}
	if v := r.URL.Query().Get("robotId"); v != "" {
		id, err := parseUUIDParam(v)
		if err != nil {
			badRequest(w, "invalid robotId")
			return
		}
		params.RobotID = id
	}
	if v := r.URL.Query().Get("scenarioId"); v != "" {
		id, err := parseUUIDParam(v)
		if err != nil {
			badRequest(w, "invalid scenarioId")
			return
		}
		params.ScenarioID = id
	}
	if v := r.URL.Query().Get("q"); v != "" {
		params.MemoQ = &v
	}
	if v := r.URL.Query().Get("markerCategories"); v != "" {
		for _, c := range strings.Split(v, ",") {
			c = strings.TrimSpace(c)
			if c == "" {
				continue
			}
			mc, err := parseMarkerCategory(c)
			if err != nil {
				badRequest(w, err.Error())
				return
			}
			params.MarkerCategories = append(params.MarkerCategories, string(mc))
		}
	}
	if v := r.URL.Query().Get("tagIds"); v != "" {
		for _, t := range strings.Split(v, ",") {
			t = strings.TrimSpace(t)
			if t == "" {
				continue
			}
			id, err := parseUUIDParam(t)
			if err != nil {
				badRequest(w, "invalid tagId")
				return
			}
			params.TagIds = append(params.TagIds, id)
		}
		params.TagCount = int32(len(params.TagIds))
	}

	if cur := r.URL.Query().Get("cursor"); cur != "" {
		t, id, err := decodeSearchCursor(cur)
		if err != nil {
			badRequest(w, err.Error())
			return
		}
		params.CursorStartedAt = t
		params.CursorID = id
	}

	rows, err := h.Q.SearchRuns(r.Context(), params)
	if err != nil {
		internalError(w, err)
		return
	}
	page, pg := paginate(rows, limit, func(rr sqlc.Run) string {
		return encodeSearchCursor(rr.StartedAt.Time, rr.ID)
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

func encodeSearchCursor(t time.Time, id pgtype.UUID) string {
	raw := fmt.Sprintf("%s|%s", t.UTC().Format(time.RFC3339Nano), uuidString(id))
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeSearchCursor(s string) (pgtype.Timestamptz, pgtype.UUID, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return pgtype.Timestamptz{}, pgtype.UUID{}, fmt.Errorf("invalid cursor: %w", err)
	}
	parts := strings.SplitN(string(b), "|", 2)
	if len(parts) != 2 {
		return pgtype.Timestamptz{}, pgtype.UUID{}, errors.New("invalid cursor format")
	}
	t, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return pgtype.Timestamptz{}, pgtype.UUID{}, fmt.Errorf("invalid cursor time: %w", err)
	}
	id, err := parseUUIDParam(parts[1])
	if err != nil {
		return pgtype.Timestamptz{}, pgtype.UUID{}, fmt.Errorf("invalid cursor id: %w", err)
	}
	return pgtype.Timestamptz{Time: t, Valid: true}, id, nil
}
