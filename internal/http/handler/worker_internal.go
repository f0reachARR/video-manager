package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/f0reachARR/video-manager/internal/hlswire"
	"github.com/f0reachARR/video-manager/internal/worker/dispatch"
)

// WorkerInternal serves the /internal/worker/jobs/* endpoints used by the
// external hls-worker process. Authentication is provided by the WorkerAuth
// middleware mounted in route.New.
type WorkerInternal struct {
	Dispatcher *dispatch.Dispatcher
}

// Claim long-polls for the next available job.
func (h *WorkerInternal) Claim(w http.ResponseWriter, r *http.Request) {
	var req hlswire.ClaimRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid claim body: "+err.Error())
		return
	}
	if len(req.Queues) == 0 {
		badRequest(w, "queues required")
		return
	}
	res, err := h.Dispatcher.Claim(r.Context(), req)
	if err != nil {
		if errors.Is(err, r.Context().Err()) {
			// client gave up; nothing to send
			return
		}
		internalError(w, err)
		return
	}
	if res == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// Heartbeat extends the lease for an in-flight job.
func (h *WorkerInternal) Heartbeat(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobId")
	var body hlswire.LeaseAuth
	if err := decodeJSON(r, &body); err != nil {
		badRequest(w, "invalid heartbeat body: "+err.Error())
		return
	}
	expires, err := h.Dispatcher.Heartbeat(jobID, body.LeaseToken)
	if err != nil {
		writeDispatchError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, hlswire.HeartbeatResponse{LeaseExpiresAt: expires})
}

// Progress is forwarded to the in-process River worker for a side-effect (e.g.
// IncrementRenditionSegments). The worker decides whether the message is
// applied or ignored.
func (h *WorkerInternal) Progress(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobId")
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		badRequest(w, "read body: "+err.Error())
		return
	}
	// Decode just the lease envelope; the typed body is opaque to dispatch
	// and is interpreted by the in-process worker's OnProgress callback.
	var env hlswire.LeaseAuth
	if err := json.Unmarshal(raw, &env); err != nil {
		badRequest(w, "invalid progress body: "+err.Error())
		return
	}
	if err := h.Dispatcher.Progress(r.Context(), jobID, env.LeaseToken, raw); err != nil {
		writeDispatchError(w, err)
		return
	}
	writeNoContent(w)
}

// Complete signals successful job completion.
func (h *WorkerInternal) Complete(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobId")
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		badRequest(w, "read body: "+err.Error())
		return
	}
	var env hlswire.LeaseAuth
	if err := json.Unmarshal(raw, &env); err != nil {
		badRequest(w, "invalid complete body: "+err.Error())
		return
	}
	if err := h.Dispatcher.Complete(jobID, env.LeaseToken, raw); err != nil {
		writeDispatchError(w, err)
		return
	}
	writeNoContent(w)
}

// Fail signals that the worker could not finish the job.
func (h *WorkerInternal) Fail(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobId")
	var req hlswire.FailRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid fail body: "+err.Error())
		return
	}
	msg := req.Error
	if msg == "" {
		msg = "worker reported failure with no message"
	}
	if err := h.Dispatcher.Fail(jobID, req.LeaseToken, msg); err != nil {
		writeDispatchError(w, err)
		return
	}
	writeNoContent(w)
}

func writeDispatchError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, dispatch.ErrJobNotFound):
		// 410 Gone — the job is no longer tracked (canceled, expired, or app
		// restarted). Worker should abandon it; the API has either retried it
		// or will retry it via River.
		writeError(w, http.StatusGone, "job_gone", "job no longer tracked", nil)
	case errors.Is(err, dispatch.ErrLeaseInvalid):
		writeError(w, http.StatusForbidden, "lease_invalid", "lease token does not match", nil)
	case errors.Is(err, dispatch.ErrLeaseExpired):
		writeError(w, http.StatusGone, "lease_expired", "lease expired", nil)
	default:
		internalError(w, err)
	}
}
