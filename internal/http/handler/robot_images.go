package handler

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/f0reachARR/video-manager/internal/auth"
	"github.com/f0reachARR/video-manager/internal/db/sqlc"
	"github.com/f0reachARR/video-manager/internal/imageproc"
	"github.com/f0reachARR/video-manager/internal/storage"
)

// maxRobotImageBytes is the per-file size cap. HEIC from modern phones can
// easily hit 5–10 MB; we set 30 to leave headroom without burning RAM.
const maxRobotImageBytes = 30 << 20

// maxRobotImageRequestBytes caps the entire multipart payload. Browsers
// dropzones happily queue 10 photos at once; this lets ~4 of them go
// through in a single request.
const maxRobotImageRequestBytes = 120 << 20

type RobotImages struct {
	Q       *sqlc.Queries
	Storage *storage.Client
}

type robotImageDTO struct {
	ID          string     `json:"id"`
	RobotID     string     `json:"robotId"`
	ContentType string     `json:"contentType"`
	Width       *int32     `json:"width"`
	Height      *int32     `json:"height"`
	SizeBytes   int64      `json:"sizeBytes"`
	Caption     string     `json:"caption"`
	CapturedAt  *time.Time `json:"capturedAt"`
	CreatedAt   time.Time  `json:"createdAt"`
	UploaderID  *string    `json:"uploaderId"`
}

func toRobotImageDTO(i sqlc.RobotImage) robotImageDTO {
	out := robotImageDTO{
		ID:          uuidString(i.ID),
		RobotID:     uuidString(i.RobotID),
		ContentType: i.ContentType,
		Width:       i.Width,
		Height:      i.Height,
		SizeBytes:   i.SizeBytes,
		Caption:     i.Caption,
		CapturedAt:  timeOrNil(i.CapturedAt),
		CreatedAt:   i.CreatedAt.Time,
	}
	if i.UploaderID.Valid {
		s := uuidString(i.UploaderID)
		out.UploaderID = &s
	}
	return out
}

type robotImageListResponse struct {
	Data []robotImageDTO `json:"data"`
}

// uploadResult is one entry in the multi-file upload response. Each file is
// processed independently — one bad HEIC must not torpedo the other photos
// the user dropped at the same time.
type uploadResult struct {
	Filename string         `json:"filename"`
	Image    *robotImageDTO `json:"image,omitempty"`
	Error    string         `json:"error,omitempty"`
}

type uploadResponse struct {
	Data []uploadResult `json:"data"`
}

// Upload accepts a multipart POST with one or more "file" parts and
// optional "caption" / "capturedAt" parts. Each file is processed
// independently. Returns 200 with per-file results (some may be errors)
// when at least one upload succeeded, 400 when all failed.
func (h *RobotImages) Upload(w http.ResponseWriter, r *http.Request) {
	robotID, err := parseUUIDParam(chi.URLParam(r, "robotId"))
	if err != nil {
		badRequest(w, "invalid robotId")
		return
	}
	if _, err := h.Q.GetRobot(r.Context(), robotID); err != nil {
		if isNoRows(err) {
			notFound(w, "robot not found")
			return
		}
		internalError(w, err)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxRobotImageRequestBytes)
	mr, err := r.MultipartReader()
	if err != nil {
		badRequest(w, "expected multipart/form-data")
		return
	}

	uploader := auth.UserIDFromContext(r.Context())
	captionDefault := ""
	results := make([]uploadResult, 0, 4)
	anySuccess := false

	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			if errors.Is(err, http.ErrMissingBoundary) || strings.Contains(err.Error(), "request body too large") {
				writeError(w, http.StatusRequestEntityTooLarge, "too_large", "request body too large", nil)
				return
			}
			badRequest(w, fmt.Sprintf("read part: %v", err))
			return
		}

		switch part.FormName() {
		case "caption":
			b, _ := io.ReadAll(io.LimitReader(part, 1<<10))
			captionDefault = string(b)
			part.Close()
			continue
		case "file":
			res := h.processOne(r.Context(), robotID, uploader, captionDefault, part)
			results = append(results, res)
			if res.Image != nil {
				anySuccess = true
			}
			part.Close()
		default:
			part.Close()
		}
	}

	if len(results) == 0 {
		badRequest(w, "no file parts")
		return
	}
	status := http.StatusCreated
	if !anySuccess {
		// 207 would be more accurate, but the frontend already inspects
		// per-file `error` fields; signaling overall failure with 400 is
		// enough.
		status = http.StatusBadRequest
	}
	writeJSON(w, status, uploadResponse{Data: results})
}

// processOne reads a single file part end-to-end: buffer → imageproc → S3
// (orig, optional display, thumb) → DB row → primary fixup.
func (h *RobotImages) processOne(
	ctx context.Context,
	robotID pgtype.UUID,
	uploader pgtype.UUID,
	caption string,
	part interface {
		FileName() string
		io.Reader
	},
) uploadResult {
	filename := part.FileName()

	// Cap each file at maxRobotImageBytes. We can't trust Content-Length on
	// individual parts, so we read with a LimitReader + sentinel.
	buf := &limitedBuffer{cap: maxRobotImageBytes + 1}
	if _, err := io.Copy(buf, part); err != nil {
		return uploadResult{Filename: filename, Error: "read: " + err.Error()}
	}
	if buf.Len() > maxRobotImageBytes {
		return uploadResult{Filename: filename, Error: fmt.Sprintf("file exceeds %d bytes", maxRobotImageBytes)}
	}

	res, err := imageproc.Process(buf.Bytes())
	if err != nil {
		return uploadResult{Filename: filename, Error: err.Error()}
	}

	imageID := pgtype.UUID{Bytes: uuid.New(), Valid: true}
	imageIDStr := uuidString(imageID)
	robotIDStr := uuidString(robotID)
	prefix := fmt.Sprintf("robot-images/%s/%s/", robotIDStr, imageIDStr)
	origKey := prefix + "orig." + extensionFor(res.OrigContentType)
	thumbKey := prefix + "thumb.jpg"
	var displayKey, displayCT *string

	if err := h.Storage.PutBytes(ctx, origKey, res.OrigContentType, res.OrigBytes); err != nil {
		return uploadResult{Filename: filename, Error: "put orig: " + err.Error()}
	}
	if res.DisplayBytes != nil {
		k := prefix + "display.jpg"
		if err := h.Storage.PutBytes(ctx, k, res.DisplayContentType, res.DisplayBytes); err != nil {
			_ = h.Storage.DeletePrefix(ctx, prefix)
			return uploadResult{Filename: filename, Error: "put display: " + err.Error()}
		}
		displayKey = &k
		ct := res.DisplayContentType
		displayCT = &ct
	}
	if err := h.Storage.PutBytes(ctx, thumbKey, "image/jpeg", res.ThumbBytes); err != nil {
		_ = h.Storage.DeletePrefix(ctx, prefix)
		return uploadResult{Filename: filename, Error: "put thumb: " + err.Error()}
	}

	captured := pgtype.Timestamptz{}
	if !res.CapturedAt.IsZero() {
		captured = pgtype.Timestamptz{Time: res.CapturedAt, Valid: true}
	}
	var orient *int16
	if res.Orientation > 0 {
		v := int16(res.Orientation)
		orient = &v
	}
	wi := int32(res.Width)
	hi := int32(res.Height)

	row, err := h.Q.InsertRobotImage(ctx, sqlc.InsertRobotImageParams{
		ID:                 imageID,
		RobotID:            robotID,
		StorageKey:         origKey,
		ContentType:        res.OrigContentType,
		DisplayKey:         displayKey,
		DisplayContentType: displayCT,
		ThumbnailKey:       thumbKey,
		SizeBytes:          int64(len(res.OrigBytes)),
		Width:              &wi,
		Height:             &hi,
		CapturedAt:         captured,
		ExifOrientation:    orient,
		Caption:            caption,
		UploaderID:         uploader,
	})
	if err != nil {
		_ = h.Storage.DeletePrefix(ctx, prefix)
		return uploadResult{Filename: filename, Error: "insert: " + err.Error()}
	}

	// If the robot has no primary yet, this image becomes primary.
	if rb, gerr := h.Q.GetRobot(ctx, robotID); gerr == nil && !rb.PrimaryImageID.Valid {
		_ = h.Q.SetRobotPrimaryImage(ctx, sqlc.SetRobotPrimaryImageParams{ImageID: row.ID, RobotID: robotID})
	}

	dto := toRobotImageDTO(row)
	return uploadResult{Filename: filename, Image: &dto}
}

// List returns all images for the given robot (optionally filtered by a
// captured_at range). Sort defaults to ascending sort_at.
func (h *RobotImages) List(w http.ResponseWriter, r *http.Request) {
	robotID, err := parseUUIDParam(chi.URLParam(r, "robotId"))
	if err != nil {
		badRequest(w, "invalid robotId")
		return
	}
	params := sqlc.ListRobotImagesByRobotParams{
		RobotID: robotID,
		Order:   "asc",
	}
	if v := r.URL.Query().Get("from"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			badRequest(w, "invalid from")
			return
		}
		params.FromAt = pgtype.Timestamptz{Time: t, Valid: true}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			badRequest(w, "invalid to")
			return
		}
		params.ToAt = pgtype.Timestamptz{Time: t, Valid: true}
	}
	if r.URL.Query().Get("sort") == "desc" {
		params.Order = "desc"
	}
	rows, err := h.Q.ListRobotImagesByRobot(r.Context(), params)
	if err != nil {
		internalError(w, err)
		return
	}
	out := make([]robotImageDTO, len(rows))
	for i, row := range rows {
		out[i] = toRobotImageDTO(row)
	}
	writeJSON(w, http.StatusOK, robotImageListResponse{Data: out})
}

type updateRobotImageRequest struct {
	Caption    *string             `json:"caption"`
	CapturedAt Optional[time.Time] `json:"capturedAt"`
}

func (h *RobotImages) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "imageId"))
	if err != nil {
		badRequest(w, "invalid imageId")
		return
	}
	var req updateRobotImageRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	params := sqlc.UpdateRobotImageParams{ID: id, Caption: req.Caption}
	if req.CapturedAt.Set {
		params.CapturedAtSet = true
		if !req.CapturedAt.Null {
			params.CapturedAt = pgtype.Timestamptz{Time: req.CapturedAt.Value, Valid: true}
		}
	}
	row, err := h.Q.UpdateRobotImage(r.Context(), params)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "image not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toRobotImageDTO(row))
}

func (h *RobotImages) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "imageId"))
	if err != nil {
		badRequest(w, "invalid imageId")
		return
	}
	row, err := h.Q.GetRobotImage(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "image not found")
			return
		}
		internalError(w, err)
		return
	}
	// Clear primary if needed, then delete row, then S3 prefix.
	_ = h.Q.ClearRobotPrimaryImageIfMatches(r.Context(), sqlc.ClearRobotPrimaryImageIfMatchesParams{
		RobotID: row.RobotID, ImageID: row.ID,
	})
	if _, err := h.Q.DeleteRobotImage(r.Context(), id); err != nil {
		internalError(w, err)
		return
	}
	prefix := fmt.Sprintf("robot-images/%s/%s/", uuidString(row.RobotID), uuidString(row.ID))
	if err := h.Storage.DeletePrefix(r.Context(), prefix); err != nil {
		slog.Warn("robot image s3 cleanup failed", "prefix", prefix, "error", err)
	}
	writeNoContent(w)
}

type setPrimaryRequest struct {
	ImageID *string `json:"imageId"`
}

func (h *RobotImages) SetPrimary(w http.ResponseWriter, r *http.Request) {
	robotID, err := parseUUIDParam(chi.URLParam(r, "robotId"))
	if err != nil {
		badRequest(w, "invalid robotId")
		return
	}
	var req setPrimaryRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	var imageID pgtype.UUID
	if req.ImageID != nil {
		id, err := parseUUIDParam(*req.ImageID)
		if err != nil {
			badRequest(w, "invalid imageId")
			return
		}
		row, err := h.Q.GetRobotImage(r.Context(), id)
		if err != nil {
			if isNoRows(err) {
				notFound(w, "image not found")
				return
			}
			internalError(w, err)
			return
		}
		if uuidString(row.RobotID) != uuidString(robotID) {
			badRequest(w, "image does not belong to robot")
			return
		}
		imageID = id
	}
	if err := h.Q.SetRobotPrimaryImage(r.Context(), sqlc.SetRobotPrimaryImageParams{
		ImageID: imageID, RobotID: robotID,
	}); err != nil {
		internalError(w, err)
		return
	}
	writeNoContent(w)
}

// ListForRun returns images that belong to the same robot as the run and
// whose captured_at falls inside the run's time window. Used by the Run
// detail UI to surface "photos taken during this run" alongside videos.
func (h *RobotImages) ListForRun(w http.ResponseWriter, r *http.Request) {
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
	start := run.StartedAt.Time
	end := start.Add(time.Duration(run.DurationSec) * time.Second)
	rows, err := h.Q.ListRobotImagesByRobot(r.Context(), sqlc.ListRobotImagesByRobotParams{
		RobotID: run.RobotID,
		FromAt:  pgtype.Timestamptz{Time: start, Valid: true},
		ToAt:    pgtype.Timestamptz{Time: end, Valid: true},
		Order:   "asc",
	})
	if err != nil {
		internalError(w, err)
		return
	}
	out := make([]robotImageDTO, len(rows))
	for i, row := range rows {
		out[i] = toRobotImageDTO(row)
	}
	writeJSON(w, http.StatusOK, robotImageListResponse{Data: out})
}

// Raw streams the original (or browser-safe display copy when the original
// is not directly viewable) for an image.
func (h *RobotImages) Raw(w http.ResponseWriter, r *http.Request) {
	row, ok := h.loadForServe(w, r)
	if !ok {
		return
	}
	key := row.StorageKey
	ct := row.ContentType
	if row.DisplayKey != nil && *row.DisplayKey != "" {
		key = *row.DisplayKey
		if row.DisplayContentType != nil {
			ct = *row.DisplayContentType
		}
	}
	streamObject(w, r, h.Storage, key, ct)
}

func (h *RobotImages) Thumb(w http.ResponseWriter, r *http.Request) {
	row, ok := h.loadForServe(w, r)
	if !ok {
		return
	}
	streamObject(w, r, h.Storage, row.ThumbnailKey, "image/jpeg")
}

func (h *RobotImages) loadForServe(w http.ResponseWriter, r *http.Request) (sqlc.RobotImage, bool) {
	id, err := parseUUIDParam(chi.URLParam(r, "imageId"))
	if err != nil {
		badRequest(w, "invalid imageId")
		return sqlc.RobotImage{}, false
	}
	row, err := h.Q.GetRobotImage(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "image not found")
			return sqlc.RobotImage{}, false
		}
		internalError(w, err)
		return sqlc.RobotImage{}, false
	}
	return row, true
}

// streamObject is the in-process proxy mirror of videos.HLSProxy: it pipes
// the S3 object through with cache headers and a weak ETag.
func streamObject(w http.ResponseWriter, r *http.Request, st *storage.Client, key, contentType string) {
	etag := `W/"` + key + `"`
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	body, ct, size, err := st.Get(r.Context(), key)
	if err != nil {
		notFound(w, "object not found")
		return
	}
	defer body.Close()
	if contentType != "" {
		ct = contentType
	}
	if ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	if size > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	}
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	_, _ = io.Copy(w, body)
}

// limitedBuffer is a minimal bytes.Buffer-alike that stops accepting writes
// past cap. Used to enforce per-file size limits without holding 30 MB+
// in memory when the request runs away.
type limitedBuffer struct {
	buf []byte
	cap int
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if len(b.buf) >= b.cap {
		// Drain the rest to advance the multipart reader past the part,
		// but don't keep the bytes.
		return len(p), nil
	}
	remain := b.cap - len(b.buf)
	if len(p) > remain {
		b.buf = append(b.buf, p[:remain]...)
		return len(p), nil
	}
	b.buf = append(b.buf, p...)
	return len(p), nil
}
func (b *limitedBuffer) Len() int     { return len(b.buf) }
func (b *limitedBuffer) Bytes() []byte { return b.buf }

func extensionFor(mime string) string {
	switch mime {
	case "image/jpeg":
		return "jpg"
	case "image/png":
		return "png"
	case "image/webp":
		return "webp"
	case "image/heic":
		return "heic"
	case "image/heif":
		return "heif"
	}
	return "bin"
}
