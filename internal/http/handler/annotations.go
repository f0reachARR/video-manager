package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
	"github.com/f0reachARR/video-manager/internal/realtime"
)

type Annotations struct {
	Q   *sqlc.Queries
	Hub *realtime.Hub
}

type annotationEvent struct {
	Type       string        `json:"type"` // "annotation.created" | "annotation.updated" | "annotation.deleted"
	VideoID    string        `json:"videoId"`
	Annotation annotationDTO `json:"annotation"`
}

type annotationDeleteEvent struct {
	Type         string `json:"type"`
	VideoID      string `json:"videoId"`
	AnnotationID string `json:"annotationId"`
}

func (h *Annotations) publish(videoID string, payload any) {
	if h.Hub == nil {
		return
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		slog.Warn("annotation event marshal failed", "error", err)
		return
	}
	h.Hub.Publish("video:"+videoID, raw)
}

type annotationDTO struct {
	ID             string          `json:"id"`
	VideoID        string          `json:"videoId"`
	AuthorID       *string         `json:"authorId"`
	StartOffsetSec float64         `json:"startOffsetSec"`
	EndOffsetSec   float64         `json:"endOffsetSec"`
	Type           string          `json:"type"`
	Geometry       json.RawMessage `json:"geometry"`
	Style          json.RawMessage `json:"style"`
	Label          string          `json:"label"`
	CreatedAt      time.Time       `json:"createdAt"`
}

func toAnnotationDTO(a sqlc.Annotation) annotationDTO {
	var author *string
	if a.AuthorID.Valid {
		s := uuidString(a.AuthorID)
		author = &s
	}
	g := json.RawMessage(a.Geometry)
	if len(g) == 0 {
		g = json.RawMessage("{}")
	}
	st := json.RawMessage(a.Style)
	if len(st) == 0 {
		st = json.RawMessage("{}")
	}
	return annotationDTO{
		ID:             uuidString(a.ID),
		VideoID:        uuidString(a.VideoID),
		AuthorID:       author,
		StartOffsetSec: a.StartOffsetSec,
		EndOffsetSec:   a.EndOffsetSec,
		Type:           string(a.Type),
		Geometry:       g,
		Style:          st,
		Label:          a.Label,
		CreatedAt:      a.CreatedAt.Time,
	}
}

type createAnnotationRequest struct {
	StartOffsetSec float64         `json:"startOffsetSec"`
	EndOffsetSec   float64         `json:"endOffsetSec"`
	Type           string          `json:"type"`
	Geometry       json.RawMessage `json:"geometry"`
	Style          json.RawMessage `json:"style"`
	Label          string          `json:"label"`
}

type updateAnnotationRequest struct {
	StartOffsetSec *float64         `json:"startOffsetSec"`
	EndOffsetSec   *float64         `json:"endOffsetSec"`
	Geometry       *json.RawMessage `json:"geometry"`
	Style          *json.RawMessage `json:"style"`
	Label          *string          `json:"label"`
}

type annotationListResponse struct {
	Data []annotationDTO `json:"data"`
}

func parseAnnotationType(s string) (sqlc.AnnotationType, error) {
	switch sqlc.AnnotationType(s) {
	case sqlc.AnnotationTypePoint, sqlc.AnnotationTypeArrow, sqlc.AnnotationTypeRect,
		sqlc.AnnotationTypePath, sqlc.AnnotationTypeText:
		return sqlc.AnnotationType(s), nil
	}
	return "", fmt.Errorf("invalid type %q", s)
}

func (h *Annotations) List(w http.ResponseWriter, r *http.Request) {
	videoID, err := parseUUIDParam(chi.URLParam(r, "videoId"))
	if err != nil {
		badRequest(w, "invalid videoId")
		return
	}
	if _, err := h.Q.GetVideo(r.Context(), videoID); err != nil {
		if isNoRows(err) {
			notFound(w, "video not found")
			return
		}
		internalError(w, err)
		return
	}
	rows, err := h.Q.ListAnnotationsByVideo(r.Context(), videoID)
	if err != nil {
		internalError(w, err)
		return
	}
	out := make([]annotationDTO, len(rows))
	for i, a := range rows {
		out[i] = toAnnotationDTO(a)
	}
	writeJSON(w, http.StatusOK, annotationListResponse{Data: out})
}

func (h *Annotations) Create(w http.ResponseWriter, r *http.Request) {
	videoID, err := parseUUIDParam(chi.URLParam(r, "videoId"))
	if err != nil {
		badRequest(w, "invalid videoId")
		return
	}
	if _, err := h.Q.GetVideo(r.Context(), videoID); err != nil {
		if isNoRows(err) {
			notFound(w, "video not found")
			return
		}
		internalError(w, err)
		return
	}
	var req createAnnotationRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.EndOffsetSec < req.StartOffsetSec {
		writeError(w, http.StatusUnprocessableEntity, "validation", "endOffsetSec < startOffsetSec", nil)
		return
	}
	annType, err := parseAnnotationType(req.Type)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", err.Error(), nil)
		return
	}
	if len(req.Geometry) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "validation", "geometry is required", nil)
		return
	}
	style := []byte(req.Style)
	if len(style) == 0 {
		style = []byte("{}")
	}
	a, err := h.Q.CreateAnnotation(r.Context(), sqlc.CreateAnnotationParams{
		VideoID:        videoID,
		AuthorID:       currentAuthorID(r),
		StartOffsetSec: req.StartOffsetSec,
		EndOffsetSec:   req.EndOffsetSec,
		Type:           annType,
		Geometry:       []byte(req.Geometry),
		Style:          style,
		Label:          req.Label,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	dto := toAnnotationDTO(a)
	h.publish(dto.VideoID, annotationEvent{Type: "annotation.created", VideoID: dto.VideoID, Annotation: dto})
	writeJSON(w, http.StatusCreated, dto)
}

func (h *Annotations) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "annotationId"))
	if err != nil {
		badRequest(w, "invalid annotationId")
		return
	}
	var req updateAnnotationRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.StartOffsetSec != nil && req.EndOffsetSec != nil &&
		*req.EndOffsetSec < *req.StartOffsetSec {
		writeError(w, http.StatusUnprocessableEntity, "validation", "endOffsetSec < startOffsetSec", nil)
		return
	}
	params := sqlc.UpdateAnnotationParams{
		ID:             id,
		StartOffsetSec: req.StartOffsetSec,
		EndOffsetSec:   req.EndOffsetSec,
		Label:          req.Label,
	}
	if req.Geometry != nil {
		params.Geometry = []byte(*req.Geometry)
	}
	if req.Style != nil {
		params.Style = []byte(*req.Style)
	}
	a, err := h.Q.UpdateAnnotation(r.Context(), params)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "annotation not found")
			return
		}
		internalError(w, err)
		return
	}
	dto := toAnnotationDTO(a)
	h.publish(dto.VideoID, annotationEvent{Type: "annotation.updated", VideoID: dto.VideoID, Annotation: dto})
	writeJSON(w, http.StatusOK, dto)
}

func (h *Annotations) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "annotationId"))
	if err != nil {
		badRequest(w, "invalid annotationId")
		return
	}
	// Read first so we know which video to broadcast on after delete.
	existing, err := h.Q.GetAnnotation(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "annotation not found")
			return
		}
		internalError(w, err)
		return
	}
	n, err := h.Q.DeleteAnnotation(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "annotation not found")
		return
	}
	videoID := uuidString(existing.VideoID)
	h.publish(videoID, annotationDeleteEvent{
		Type:         "annotation.deleted",
		VideoID:      videoID,
		AnnotationID: uuidString(id),
	})
	writeNoContent(w)
}
