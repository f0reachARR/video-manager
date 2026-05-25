package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"

	"github.com/f0reachARR/soiree/internal/realtime"
)

type WS struct {
	Hub *realtime.Hub
	// AllowedOrigins is the same list used by the HTTP CORS middleware.
	// When empty, websocket connections accept any origin (dev mode).
	AllowedOrigins []string
}

// connectOptions translates AllowedOrigins into coder/websocket's accept option.
func (h *WS) acceptOptions() *websocket.AcceptOptions {
	opts := &websocket.AcceptOptions{}
	if len(h.AllowedOrigins) == 0 {
		opts.InsecureSkipVerify = true
		return opts
	}
	opts.OriginPatterns = h.AllowedOrigins
	return opts
}

// SubscribeRun handles GET /ws/run/{runId}. The connection both receives and
// publishes JSON events on "run:<runId>". Receive side is used for Marker
// realtime + playback-position sync; publish side is used by viewers to share
// their playback state with other viewers of the same Run.
func (h *WS) SubscribeRun(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runId")
	if _, err := parseUUIDParam(runID); err != nil {
		badRequest(w, "invalid runId")
		return
	}
	h.serveSubscribe(w, r, "run:"+runID, true)
}

// SubscribeVideo handles GET /ws/video/{videoId}. Bidirectional: clients can
// publish to "video:<videoId>" by writing JSON, and receive other clients'
// publishes. Used for ephemeral live ink and similar transient state.
func (h *WS) SubscribeVideo(w http.ResponseWriter, r *http.Request) {
	videoID := chi.URLParam(r, "videoId")
	if _, err := parseUUIDParam(videoID); err != nil {
		badRequest(w, "invalid videoId")
		return
	}
	h.serveSubscribe(w, r, "video:"+videoID, true)
}

func (h *WS) serveSubscribe(w http.ResponseWriter, r *http.Request, topic string, allowPublish bool) {
	c, err := websocket.Accept(w, r, h.acceptOptions())
	if err != nil {
		slog.Warn("ws accept failed", "error", err, "topic", topic)
		return
	}
	defer c.CloseNow()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	sub := h.Hub.Subscribe(topic)
	defer h.Hub.Unsubscribe(sub)

	// Outbound: drain hub messages to the socket.
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-sub.C:
				if !ok {
					return
				}
				writeCtx, writeCancel := context.WithTimeout(ctx, 10*time.Second)
				err := c.Write(writeCtx, websocket.MessageText, msg)
				writeCancel()
				if err != nil {
					cancel()
					return
				}
			}
		}
	}()

	// Inbound: either consume publishes (allowPublish) or just keep the
	// connection alive until the client closes / sends bogus data.
	for {
		typ, raw, err := c.Read(ctx)
		if err != nil {
			break
		}
		if !allowPublish {
			// reject inbound traffic from subscribers
			_ = c.Close(websocket.StatusPolicyViolation, "no publish on this topic")
			return
		}
		if typ != websocket.MessageText {
			continue
		}
		// Validate JSON cheaply before broadcasting to avoid binary spam.
		if !json.Valid(raw) {
			continue
		}
		h.Hub.Publish(topic, raw, sub.ID)
	}
	_ = c.Close(websocket.StatusNormalClosure, "")
}
