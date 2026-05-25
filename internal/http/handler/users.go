package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/f0reachARR/soiree/internal/db/sqlc"
)

type Users struct {
	Q *sqlc.Queries
}

type userDTO struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Color     *string   `json:"color"`
	CreatedAt time.Time `json:"createdAt"`
}

func toUserDTO(u sqlc.User) userDTO {
	return userDTO{
		ID:        uuidString(u.ID),
		Name:      u.Name,
		Color:     u.Color,
		CreatedAt: u.CreatedAt.Time,
	}
}

type createUserRequest struct {
	Name  string  `json:"name"`
	Color *string `json:"color"`
}

type updateUserRequest struct {
	Name  *string         `json:"name"`
	Color Optional[string] `json:"color"`
}

type userListResponse struct {
	Data       []userDTO `json:"data"`
	Pagination pageOut   `json:"pagination"`
}

func (h *Users) List(w http.ResponseWriter, r *http.Request) {
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
	rows, err := h.Q.ListUsersPage(r.Context(), sqlc.ListUsersPageParams{
		Limit:           limit + 1,
		CursorCreatedAt: cursorAt,
		CursorID:        cursorID,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	page, pg := paginate(rows, limit, func(u sqlc.User) string {
		return encodeCursor(u.CreatedAt.Time, u.ID)
	})
	out := make([]userDTO, len(page))
	for i, u := range page {
		out[i] = toUserDTO(u)
	}
	writeJSON(w, http.StatusOK, userListResponse{Data: out, Pagination: pg})
}

func (h *Users) Create(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "name is required", nil)
		return
	}
	u, err := h.Q.CreateUser(r.Context(), sqlc.CreateUserParams{Name: req.Name, Color: req.Color})
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toUserDTO(u))
}

func (h *Users) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "userId"))
	if err != nil {
		badRequest(w, "invalid userId")
		return
	}
	u, err := h.Q.GetUser(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "user not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toUserDTO(u))
}

func (h *Users) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "userId"))
	if err != nil {
		badRequest(w, "invalid userId")
		return
	}
	var req updateUserRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	params := sqlc.UpdateUserParams{ID: id, Name: req.Name}
	if req.Color.Set {
		params.ColorSet = true
		if !req.Color.Null {
			v := req.Color.Value
			params.Color = &v
		}
	}
	u, err := h.Q.UpdateUser(r.Context(), params)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "user not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toUserDTO(u))
}

func (h *Users) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "userId"))
	if err != nil {
		badRequest(w, "invalid userId")
		return
	}
	n, err := h.Q.DeleteUser(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "user not found")
		return
	}
	writeNoContent(w)
}
