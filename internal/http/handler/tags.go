package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

type Tags struct {
	Q *sqlc.Queries
}

type tagDTO struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Color     *string   `json:"color"`
	CreatedAt time.Time `json:"createdAt"`
}

func toTagDTO(t sqlc.Tag) tagDTO {
	return tagDTO{
		ID:        uuidString(t.ID),
		Name:      t.Name,
		Color:     t.Color,
		CreatedAt: t.CreatedAt.Time,
	}
}

type createTagRequest struct {
	Name  string  `json:"name"`
	Color *string `json:"color"`
}

type updateTagRequest struct {
	Name  *string         `json:"name"`
	Color Optional[string] `json:"color"`
}

type tagListResponse struct {
	Data       []tagDTO `json:"data"`
	Pagination pageOut  `json:"pagination"`
}

func (h *Tags) List(w http.ResponseWriter, r *http.Request) {
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
	rows, err := h.Q.ListTagsPage(r.Context(), sqlc.ListTagsPageParams{
		Limit:           limit + 1,
		CursorCreatedAt: cursorAt,
		CursorID:        cursorID,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	page, pg := paginate(rows, limit, func(t sqlc.Tag) string {
		return encodeCursor(t.CreatedAt.Time, t.ID)
	})
	out := make([]tagDTO, len(page))
	for i, t := range page {
		out[i] = toTagDTO(t)
	}
	writeJSON(w, http.StatusOK, tagListResponse{Data: out, Pagination: pg})
}

func (h *Tags) Create(w http.ResponseWriter, r *http.Request) {
	var req createTagRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "name is required", nil)
		return
	}
	t, err := h.Q.CreateTag(r.Context(), sqlc.CreateTagParams{Name: req.Name, Color: req.Color})
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toTagDTO(t))
}

func (h *Tags) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "tagId"))
	if err != nil {
		badRequest(w, "invalid tagId")
		return
	}
	t, err := h.Q.GetTag(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "tag not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toTagDTO(t))
}

func (h *Tags) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "tagId"))
	if err != nil {
		badRequest(w, "invalid tagId")
		return
	}
	var req updateTagRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	params := sqlc.UpdateTagParams{ID: id, Name: req.Name}
	if req.Color.Set {
		params.ColorSet = true
		if !req.Color.Null {
			v := req.Color.Value
			params.Color = &v
		}
	}
	t, err := h.Q.UpdateTag(r.Context(), params)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "tag not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toTagDTO(t))
}

func (h *Tags) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "tagId"))
	if err != nil {
		badRequest(w, "invalid tagId")
		return
	}
	n, err := h.Q.DeleteTag(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "tag not found")
		return
	}
	writeNoContent(w)
}
