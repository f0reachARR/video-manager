package handler

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

// JobEnqueuer is the subset of worker.Manager the upload handler depends on.
type JobEnqueuer interface {
	EnqueueProbe(ctx context.Context, videoID string) error
}

type Uploads struct {
	Q           *sqlc.Queries
	Worker      JobEnqueuer
	BulkUploads *BulkUploads
}

// tusHookRequest mirrors the JSON tusd v2 sends to its HTTP hook endpoint.
// We only model the fields we actually consume.
type tusHookRequest struct {
	Type  string `json:"Type"`
	Event struct {
		Upload struct {
			ID       string            `json:"ID"`
			Size     int64             `json:"Size"`
			MetaData map[string]string `json:"MetaData"`
			Storage  map[string]string `json:"Storage"`
		} `json:"Upload"`
	} `json:"Event"`
}

type tusHookResponse struct {
	HTTPResponse *tusHTTPResponse `json:"httpResponse,omitempty"`
	RejectUpload bool             `json:"rejectUpload,omitempty"`
	VideoID      *string          `json:"videoId,omitempty"`
}

type tusHTTPResponse struct {
	StatusCode int               `json:"statusCode,omitempty"`
	Body       string            `json:"body,omitempty"`
	Headers    map[string]string `json:"headers,omitempty"`
}

func (h *Uploads) TusHook(w http.ResponseWriter, r *http.Request) {
	var req tusHookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.Type != "post-finish" {
		// We only act on post-finish for Phase 1 §5.
		writeJSON(w, http.StatusOK, tusHookResponse{})
		return
	}
	storageKey := req.Event.Upload.Storage["Key"]
	if storageKey == "" {
		storageKey = req.Event.Upload.ID
	}
	if storageKey == "" {
		badRequest(w, "missing upload id")
		return
	}

	// idempotency: tusd may retry; if we've already created a Video row, return success.
	if existing, err := h.Q.GetVideoByStorageKey(r.Context(), storageKey); err == nil {
		id := uuidString(existing.ID)
		writeJSON(w, http.StatusOK, tusHookResponse{
			VideoID: &id,
			// Forward the video id back to the browser via the
			// upload-completion response headers so bulk-upload UIs can
			// surface "→ Run作成" without an extra round-trip.
			HTTPResponse: &tusHTTPResponse{
				Headers: map[string]string{"X-Video-Id": id},
			},
		})
		return
	} else if !isNoRows(err) {
		internalError(w, err)
		return
	}

	meta := req.Event.Upload.MetaData
	params := sqlc.CreateVideoParams{StorageKey: storageKey}
	// Use the original filename as the initial human-readable label.
	if v := meta["filename"]; v != "" {
		params.DisplayName = v
	}
	if v := meta["deviceId"]; v != "" {
		id, err := parseUUIDParam(v)
		if err == nil {
			params.DeviceID = id
		} else {
			slog.Warn("tus hook: invalid deviceId metadata", "value", v)
		}
	}
	if v := meta["sessionId"]; v != "" {
		id, err := parseUUIDParam(v)
		if err == nil {
			params.SessionID = id
		} else {
			slog.Warn("tus hook: invalid sessionId metadata", "value", v)
		}
	}
	if v := meta["uploaderId"]; v != "" {
		id, err := parseUUIDParam(v)
		if err == nil {
			params.UploaderID = id
		} else {
			slog.Warn("tus hook: invalid uploaderId metadata", "value", v)
		}
	}

	video, err := h.Q.CreateVideo(r.Context(), params)
	if err != nil {
		// race: another concurrent hook may have inserted under the same storage key
		if existing, err2 := h.Q.GetVideoByStorageKey(r.Context(), storageKey); err2 == nil {
			id := uuidString(existing.ID)
			writeJSON(w, http.StatusOK, tusHookResponse{
				VideoID: &id,
				HTTPResponse: &tusHTTPResponse{
					Headers: map[string]string{"X-Video-Id": id},
				},
			})
			return
		}
		internalError(w, err)
		return
	}

	id := uuidString(video.ID)
	slog.Info("tus hook: created video", "id", id, "storageKey", storageKey, "size", req.Event.Upload.Size)
	if h.Worker != nil {
		if err := h.Worker.EnqueueProbe(r.Context(), id); err != nil {
			slog.Warn("enqueue probe failed", "error", err, "videoId", id)
		}
	}
	if h.BulkUploads != nil {
		// Bulk-upload dedup: the browser pre-computes a 1 MiB head hash and
		// pairs it with the tournament. We only record when both are present;
		// regular (non-bulk) uploads simply skip this branch.
		if tidStr := meta["tournamentId"]; tidStr != "" {
			tid, err := parseUUIDParam(tidStr)
			if err != nil {
				slog.Warn("tus hook: invalid tournamentId metadata", "value", tidStr)
			} else if hh := meta["headHashHex"]; hh != "" {
				headHash, err := hex.DecodeString(hh)
				if err != nil {
					slog.Warn("tus hook: invalid headHashHex metadata", "value", hh)
				} else {
					sizeStr := meta["sizeBytes"]
					if sizeStr == "" {
						sizeStr = strconv.FormatInt(req.Event.Upload.Size, 10)
					}
					size, err := strconv.ParseInt(sizeStr, 10, 64)
					if err != nil {
						slog.Warn("tus hook: invalid sizeBytes metadata", "value", sizeStr)
					} else {
						filename := meta["filename"]
						if err := h.BulkUploads.RegisterVideoFingerprint(r.Context(), tid, video.ID, headHash, size, filename); err != nil {
							slog.Warn("register video fingerprint failed", "error", err, "videoId", id)
						}
					}
				}
			}
		}
	}
	writeJSON(w, http.StatusOK, tusHookResponse{
		VideoID: &id,
		HTTPResponse: &tusHTTPResponse{
			Headers: map[string]string{"X-Video-Id": id},
		},
	})
}
