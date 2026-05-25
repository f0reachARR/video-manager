package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/f0reachARR/soiree/internal/db/sqlc"
)

type Devices struct {
	Q *sqlc.Queries
}

type deviceDTO struct {
	ID                   string    `json:"id"`
	Name                 string    `json:"name"`
	DefaultTimeOffsetSec int32     `json:"defaultTimeOffsetSec"`
	CreatedAt            time.Time `json:"createdAt"`
}

func toDeviceDTO(d sqlc.Device) deviceDTO {
	return deviceDTO{
		ID:                   uuidString(d.ID),
		Name:                 d.Name,
		DefaultTimeOffsetSec: d.DefaultTimeOffsetSec,
		CreatedAt:            d.CreatedAt.Time,
	}
}

type createDeviceRequest struct {
	Name                 string `json:"name"`
	DefaultTimeOffsetSec *int32 `json:"defaultTimeOffsetSec"`
}

type updateDeviceRequest struct {
	Name                 *string `json:"name"`
	DefaultTimeOffsetSec *int32  `json:"defaultTimeOffsetSec"`
}

type deviceListResponse struct {
	Data       []deviceDTO `json:"data"`
	Pagination pageOut     `json:"pagination"`
}

func (h *Devices) List(w http.ResponseWriter, r *http.Request) {
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
	rows, err := h.Q.ListDevicesPage(r.Context(), sqlc.ListDevicesPageParams{
		Limit:           limit + 1,
		CursorCreatedAt: cursorAt,
		CursorID:        cursorID,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	page, pg := paginate(rows, limit, func(d sqlc.Device) string {
		return encodeCursor(d.CreatedAt.Time, d.ID)
	})
	out := make([]deviceDTO, len(page))
	for i, d := range page {
		out[i] = toDeviceDTO(d)
	}
	writeJSON(w, http.StatusOK, deviceListResponse{Data: out, Pagination: pg})
}

func (h *Devices) Create(w http.ResponseWriter, r *http.Request) {
	var req createDeviceRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "name is required", nil)
		return
	}
	offset := int32(0)
	if req.DefaultTimeOffsetSec != nil {
		offset = *req.DefaultTimeOffsetSec
	}
	d, err := h.Q.CreateDevice(r.Context(), sqlc.CreateDeviceParams{Name: req.Name, DefaultTimeOffsetSec: offset})
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toDeviceDTO(d))
}

func (h *Devices) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "deviceId"))
	if err != nil {
		badRequest(w, "invalid deviceId")
		return
	}
	d, err := h.Q.GetDevice(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "device not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDeviceDTO(d))
}

func (h *Devices) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "deviceId"))
	if err != nil {
		badRequest(w, "invalid deviceId")
		return
	}
	var req updateDeviceRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	d, err := h.Q.UpdateDevice(r.Context(), sqlc.UpdateDeviceParams{
		ID:                   id,
		Name:                 req.Name,
		DefaultTimeOffsetSec: req.DefaultTimeOffsetSec,
	})
	if err != nil {
		if isNoRows(err) {
			notFound(w, "device not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDeviceDTO(d))
}

func (h *Devices) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "deviceId"))
	if err != nil {
		badRequest(w, "invalid deviceId")
		return
	}
	n, err := h.Q.DeleteDevice(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "device not found")
		return
	}
	writeNoContent(w)
}
