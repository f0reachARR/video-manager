package handler

import (
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
	"github.com/f0reachARR/video-manager/internal/storage"
)

type Videos struct {
	Q       *sqlc.Queries
	Storage *storage.Client
	// HLSBaseURL, when non-empty, overrides the scheme+host used to build HLS
	// proxy playback URLs. No trailing slash. Empty means derive from the
	// inbound request.
	HLSBaseURL string
}

type videoDTO struct {
	ID            string     `json:"id"`
	TournamentID  string     `json:"tournamentId"`
	SessionID     *string    `json:"sessionId"`
	DeviceID      *string    `json:"deviceId"`
	UploaderID    *string    `json:"uploaderId"`
	StorageKey    string     `json:"storageKey"`
	DisplayName   string     `json:"displayName"`
	RecordedAt    *time.Time `json:"recordedAt"`
	DurationSec   *int32     `json:"durationSec"`
	TimeOffsetSec int32      `json:"timeOffsetSec"`
	HasThumbnail  bool       `json:"hasThumbnail"`
	HLSStatus     string     `json:"hlsStatus"`
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
		TournamentID:  uuidString(v.TournamentID),
		SessionID:     sessionID,
		DeviceID:      deviceID,
		UploaderID:    uploaderID,
		StorageKey:    v.StorageKey,
		DisplayName:   v.DisplayName,
		RecordedAt:    timeOrNil(v.RecordedAt),
		DurationSec:   v.DurationSec,
		TimeOffsetSec: v.TimeOffsetSec,
		HasThumbnail:  v.ThumbnailKey != nil && *v.ThumbnailKey != "",
		HLSStatus:     string(v.HLSStatus),
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
	// Kind is "hls" when the URL is a master.m3u8 (adaptive), "mp4" when the
	// HLS pipeline is still encoding or has failed and we serve the raw upload.
	Kind string `json:"kind"`
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
	tournamentID, err := requiredTournamentID(r)
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	params := sqlc.ListVideosPageParams{
		TournamentID:    tournamentID,
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
			// Keep tournament_id consistent with whichever session the video is
			// being re-attached to. Clearing the session (Null) leaves tournament_id
			// alone — the video stays in its current tournament.
			sess, err := h.Q.GetSession(r.Context(), sid)
			if err != nil {
				if isNoRows(err) {
					writeError(w, http.StatusUnprocessableEntity, "validation", "session not found", nil)
					return
				}
				internalError(w, err)
				return
			}
			params.SessionID = sid
			params.TournamentID = sess.TournamentID
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
	// Best-effort cleanup of HLS artifacts. CASCADE removed video_renditions
	// already; this drops the S3 objects so we don't leak segments.
	hlsPrefix := "hls/" + uuidString(v.ID) + "/"
	if err := h.Storage.DeletePrefix(r.Context(), hlsPrefix); err != nil {
		slog.Warn("hls cleanup failed", "videoId", uuidString(v.ID), "error", err)
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
	writeJSON(w, http.StatusOK, playbackUrlResponse{URL: url, ExpiresAt: expires, Kind: "image"})
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
	// HLS is preferred when ready. The master playlist + variant playlists +
	// segments are served through the in-process proxy at /videos/{id}/hls/*
	// so we don't have to sign every segment URL individually.
	if v.HLSStatus == sqlc.HlsStatusReady && v.HlsMasterKey != nil {
		expires := time.Now().Add(h.Storage.PresignTTL())
		out := playbackUrlResponse{
			URL:       h.proxyHLSURL(r, uuidString(v.ID), "master.m3u8"),
			ExpiresAt: expires,
			Kind:      "hls",
		}
		writeJSON(w, http.StatusOK, out)
		return
	}
	url, expires, err := h.Storage.PresignGet(r.Context(), v.StorageKey)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, playbackUrlResponse{URL: url, ExpiresAt: expires, Kind: "mp4"})
}

type renditionDTO struct {
	ID           string     `json:"id"`
	VideoID      string     `json:"videoId"`
	Kind         string     `json:"kind"`
	Status       string     `json:"status"`
	Passthrough  bool       `json:"passthrough"`
	Width        int32      `json:"width"`
	Height       int32      `json:"height"`
	BandwidthBps *int32     `json:"bandwidthBps"`
	PlaylistKey  string     `json:"playlistKey"`
	SegmentsDone int32      `json:"segmentsDone"`
	Error        *string    `json:"error"`
	StartedAt    *time.Time `json:"startedAt"`
	CompletedAt  *time.Time `json:"completedAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

type renditionListResponse struct {
	VideoID     string          `json:"videoId"`
	HLSStatus   string          `json:"hlsStatus"`
	DurationSec *int32          `json:"durationSec"`
	Data        []renditionDTO  `json:"data"`
}

type encodingJobDTO struct {
	Video      videoDTO       `json:"video"`
	Renditions []renditionDTO `json:"renditions"`
}

type encodingJobListResponse struct {
	Data []encodingJobDTO `json:"data"`
}

func toRenditionDTO(r sqlc.VideoRendition) renditionDTO {
	return renditionDTO{
		ID:           uuidString(r.ID),
		VideoID:      uuidString(r.VideoID),
		Kind:         string(r.Kind),
		Status:       string(r.Status),
		Passthrough:  r.Passthrough,
		Width:        r.Width,
		Height:       r.Height,
		BandwidthBps: r.BandwidthBps,
		PlaylistKey:  r.PlaylistKey,
		SegmentsDone: r.SegmentsDone,
		Error:        r.Error,
		StartedAt:    timeOrNil(r.StartedAt),
		CompletedAt:  timeOrNil(r.CompletedAt),
		UpdatedAt:    r.UpdatedAt.Time,
	}
}

// Renditions returns the per-variant HLS state for one video.
func (h *Videos) Renditions(w http.ResponseWriter, r *http.Request) {
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
	rows, err := h.Q.ListRenditionsByVideo(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	out := renditionListResponse{
		VideoID:     uuidString(v.ID),
		HLSStatus:   string(v.HLSStatus),
		DurationSec: v.DurationSec,
		Data:        make([]renditionDTO, 0, len(rows)),
	}
	for _, r := range rows {
		out.Data = append(out.Data, toRenditionDTO(r))
	}
	writeJSON(w, http.StatusOK, out)
}

// EncodingJobs lists every video currently encoding or recently failed,
// along with their renditions. Powers the /encoding dashboard.
func (h *Videos) EncodingJobs(w http.ResponseWriter, r *http.Request) {
	limit := int32(50)
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			if n < 1 {
				n = 1
			}
			if n > 200 {
				n = 200
			}
			limit = int32(n)
		}
	}
	videos, err := h.Q.ListEncodingVideos(r.Context(), limit)
	if err != nil {
		internalError(w, err)
		return
	}
	ids := make([]pgtype.UUID, 0, len(videos))
	for _, v := range videos {
		ids = append(ids, v.ID)
	}
	rends := []sqlc.VideoRendition{}
	if len(ids) > 0 {
		rends, err = h.Q.ListRenditionsByVideos(r.Context(), ids)
		if err != nil {
			internalError(w, err)
			return
		}
	}
	byVideo := map[string][]renditionDTO{}
	for _, rd := range rends {
		key := uuidString(rd.VideoID)
		byVideo[key] = append(byVideo[key], toRenditionDTO(rd))
	}
	out := encodingJobListResponse{Data: make([]encodingJobDTO, 0, len(videos))}
	for _, v := range videos {
		key := uuidString(v.ID)
		out.Data = append(out.Data, encodingJobDTO{
			Video:      toVideoDTO(v),
			Renditions: byVideo[key],
		})
	}
	writeJSON(w, http.StatusOK, out)
}

// HLSProxy streams a single HLS object (master.m3u8, variant playlist, or
// .ts segment) to the client. The path after /videos/{videoId}/hls/ is mapped
// to the S3 key hls/{videoId}/{rest}. Authorization piggybacks on the API
// middleware just like any other endpoint, so segment URLs don't need to be
// signed individually.
func (h *Videos) HLSProxy(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "videoId"))
	if err != nil {
		badRequest(w, "invalid videoId")
		return
	}
	rest := chi.URLParam(r, "*")
	if rest == "" {
		notFound(w, "missing hls path")
		return
	}
	if !isSafeHLSPath(rest) {
		badRequest(w, "invalid hls path")
		return
	}
	key := "hls/" + uuidString(id) + "/" + rest
	body, ct, size, err := h.Storage.Get(r.Context(), key)
	if err != nil {
		notFound(w, "hls object not found")
		return
	}
	defer body.Close()
	if ct == "" {
		ct = contentTypeFor(rest)
	}
	w.Header().Set("Content-Type", ct)
	if size > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	}
	// Variant playlists update progressively during encoding; tell the browser
	// not to cache them aggressively. Segments are immutable.
	if strings.HasSuffix(rest, ".m3u8") {
		w.Header().Set("Cache-Control", "no-store")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	_, _ = io.Copy(w, body)
}

// isSafeHLSPath rejects paths that would escape the hls/{videoId}/ prefix or
// reference unrelated files.
func isSafeHLSPath(p string) bool {
	if strings.Contains(p, "..") {
		return false
	}
	if strings.HasPrefix(p, "/") {
		return false
	}
	return strings.HasSuffix(p, ".m3u8") || strings.HasSuffix(p, ".ts")
}

func contentTypeFor(name string) string {
	switch {
	case strings.HasSuffix(name, ".m3u8"):
		return "application/vnd.apple.mpegurl"
	case strings.HasSuffix(name, ".ts"):
		return "video/mp2t"
	default:
		return "application/octet-stream"
	}
}

// proxyHLSURL returns an absolute URL to the in-process HLS proxy for the
// given videoId and object path. When HLSBaseURL is configured it is used
// verbatim; otherwise the base is derived from the inbound request, which
// works behind reverse proxies as long as r.Host is set correctly.
func (h *Videos) proxyHLSURL(r *http.Request, videoID, sub string) string {
	base := h.HLSBaseURL
	if base == "" {
		scheme := "http"
		if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
			scheme = "https"
		}
		base = scheme + "://" + r.Host
	}
	return base + "/videos/" + videoID + "/hls/" + sub
}
