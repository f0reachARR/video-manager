package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
	"github.com/f0reachARR/video-manager/internal/storage"
)

type Videos struct {
	Q       *sqlc.Queries
	Storage *storage.Client
}

type videoDTO struct {
	ID            string     `json:"id"`
	SessionID     *string    `json:"sessionId"`
	DeviceID      *string    `json:"deviceId"`
	UploaderID    *string    `json:"uploaderId"`
	StorageKey    string     `json:"storageKey"`
	DisplayName   string     `json:"displayName"`
	RecordedAt    *time.Time `json:"recordedAt"`
	DurationSec   *int32     `json:"durationSec"`
	TimeOffsetSec int32      `json:"timeOffsetSec"`
	HasThumbnail  bool       `json:"hasThumbnail"`
	CreatedAt     time.Time  `json:"createdAt"`
}

func toVideoDTO(v sqlc.Video) videoDTO {
	var sessionID, deviceID, uploaderID *string
	if v.SessionID.Valid {
		s := uuidString(v.SessionID)
		sessionID = &s
	}
	if v.DeviceID.Valid {
		s := uuidString(v.DeviceID)
		deviceID = &s
	}
	if v.UploaderID.Valid {
		s := uuidString(v.UploaderID)
		uploaderID = &s
	}
	return videoDTO{
		ID:            uuidString(v.ID),
		SessionID:     sessionID,
		DeviceID:      deviceID,
		UploaderID:    uploaderID,
		StorageKey:    v.StorageKey,
		DisplayName:   v.DisplayName,
		RecordedAt:    timeOrNil(v.RecordedAt),
		DurationSec:   v.DurationSec,
		TimeOffsetSec: v.TimeOffsetSec,
		HasThumbnail:  v.ThumbnailKey != nil && *v.ThumbnailKey != "",
		CreatedAt:     v.CreatedAt.Time,
	}
}

type videoListResponse struct {
	Data       []videoDTO `json:"data"`
	Pagination pageOut    `json:"pagination"`
}

type updateVideoRequest struct {
	SessionID     Optional[string]    `json:"sessionId"`
	DeviceID      Optional[string]    `json:"deviceId"`
	RecordedAt    Optional[time.Time] `json:"recordedAt"`
	TimeOffsetSec *int32              `json:"timeOffsetSec"`
	DisplayName   *string             `json:"displayName"`
}

type playbackUrlResponse struct {
	URL       string    `json:"url"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func (h *Videos) List(w http.ResponseWriter, r *http.Request) {
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
	params := sqlc.ListVideosPageParams{
		Limit:           limit + 1,
		CursorCreatedAt: cursorAt,
		CursorID:        cursorID,
	}
	if v := r.URL.Query().Get("sessionId"); v != "" {
		id, err := parseUUIDParam(v)
		if err != nil {
			badRequest(w, "invalid sessionId")
			return
		}
		params.SessionID = id
	}
	if v := r.URL.Query().Get("deviceId"); v != "" {
		id, err := parseUUIDParam(v)
		if err != nil {
			badRequest(w, "invalid deviceId")
			return
		}
		params.DeviceID = id
	}
	if v := r.URL.Query().Get("unassigned"); v != "" {
		b := v == "true" || v == "1"
		params.Unassigned = &b
	}
	rows, err := h.Q.ListVideosPage(r.Context(), params)
	if err != nil {
		internalError(w, err)
		return
	}
	page, pg := paginate(rows, limit, func(v sqlc.Video) string {
		return encodeCursor(v.CreatedAt.Time, v.ID)
	})
	out := make([]videoDTO, len(page))
	for i, v := range page {
		out[i] = toVideoDTO(v)
	}
	writeJSON(w, http.StatusOK, videoListResponse{Data: out, Pagination: pg})
}

func (h *Videos) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "videoId"))
	if err != nil {
		badRequest(w, "invalid videoId")
		return
	}
	v, err := h.Q.GetVideo(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "video not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toVideoDTO(v))
}

func (h *Videos) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "videoId"))
	if err != nil {
		badRequest(w, "invalid videoId")
		return
	}
	var req updateVideoRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	params := sqlc.UpdateVideoParams{ID: id, TimeOffsetSec: req.TimeOffsetSec, DisplayName: req.DisplayName}
	if req.SessionID.Set {
		params.SessionIDSet = true
		if !req.SessionID.Null {
			sid, err := parseUUIDParam(req.SessionID.Value)
			if err != nil {
				writeError(w, http.StatusUnprocessableEntity, "validation", "invalid sessionId", nil)
				return
			}
			params.SessionID = sid
		}
	}
	if req.DeviceID.Set {
		params.DeviceIDSet = true
		if !req.DeviceID.Null {
			did, err := parseUUIDParam(req.DeviceID.Value)
			if err != nil {
				writeError(w, http.StatusUnprocessableEntity, "validation", "invalid deviceId", nil)
				return
			}
			params.DeviceID = did
		}
	}
	if req.RecordedAt.Set {
		params.RecordedAtSet = true
		if !req.RecordedAt.Null {
			params.RecordedAt = pgtypeTimestamptz(req.RecordedAt.Value)
		}
	}
	v, err := h.Q.UpdateVideo(r.Context(), params)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "video not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toVideoDTO(v))
}

func (h *Videos) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "videoId"))
	if err != nil {
		badRequest(w, "invalid videoId")
		return
	}
	v, err := h.Q.GetVideo(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "video not found")
			return
		}
		internalError(w, err)
		return
	}
	n, err := h.Q.DeleteVideo(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "video not found")
		return
	}
	if err := h.Storage.Delete(r.Context(), v.StorageKey); err != nil {
		// DB row already deleted; log and continue rather than 5xx for the user.
		internalError(w, err)
		return
	}
	writeNoContent(w)
}

func (h *Videos) ThumbnailURL(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "videoId"))
	if err != nil {
		badRequest(w, "invalid videoId")
		return
	}
	v, err := h.Q.GetVideo(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "video not found")
			return
		}
		internalError(w, err)
		return
	}
	if v.ThumbnailKey == nil || *v.ThumbnailKey == "" {
		notFound(w, "thumbnail not available")
		return
	}
	url, expires, err := h.Storage.PresignGet(r.Context(), *v.ThumbnailKey)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, playbackUrlResponse{URL: url, ExpiresAt: expires})
}

func (h *Videos) PlaybackURL(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "videoId"))
	if err != nil {
		badRequest(w, "invalid videoId")
		return
	}
	v, err := h.Q.GetVideo(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "video not found")
			return
		}
		internalError(w, err)
		return
	}
	url, expires, err := h.Storage.PresignGet(r.Context(), v.StorageKey)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, playbackUrlResponse{URL: url, ExpiresAt: expires})
}
