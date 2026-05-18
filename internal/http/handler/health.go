package handler

import (
	"context"
	"net/http"
	"time"
)

type Pinger interface {
	Ping(ctx context.Context) error
}

type Health struct {
	Version string
	DB      Pinger
}

type healthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

func (h *Health) Live(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok", Version: h.Version})
}

func (h *Health) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if err := h.DB.Ping(ctx); err != nil {
		writeError(w, http.StatusServiceUnavailable, "db_unavailable", err.Error(), nil)
		return
	}
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok", Version: h.Version})
}
