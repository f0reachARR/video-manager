// Package realtime is a small topic-based pub/sub fan-out used by WebSocket
// connections. Messages are JSON byte slices opaque to the hub.
package realtime

import (
	"sync"
	"sync/atomic"
)

// Hub broadcasts messages to all subscribers of a topic. Publishes are
// non-blocking — subscribers with full buffers are dropped silently. Topics are
// arbitrary strings; the convention used by the API layer is "run:<uuid>",
// "video:<uuid>".
type Hub struct {
	mu     sync.RWMutex
	topics map[string]map[uint64]*Subscriber
	nextID atomic.Uint64
}

func NewHub() *Hub {
	return &Hub{topics: make(map[string]map[uint64]*Subscriber)}
}

// Subscriber is a per-connection receive channel. The caller reads from C and
// is responsible for calling hub.Unsubscribe(...) when done.
type Subscriber struct {
	ID    uint64
	Topic string
	C     chan []byte
}

const subscriberBuffer = 16

// Subscribe attaches a new subscriber to the topic.
func (h *Hub) Subscribe(topic string) *Subscriber {
	sub := &Subscriber{
		ID:    h.nextID.Add(1),
		Topic: topic,
		C:     make(chan []byte, subscriberBuffer),
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	subs, ok := h.topics[topic]
	if !ok {
		subs = make(map[uint64]*Subscriber)
		h.topics[topic] = subs
	}
	subs[sub.ID] = sub
	return sub
}

// Unsubscribe removes a subscriber and closes its channel.
func (h *Hub) Unsubscribe(sub *Subscriber) {
	h.mu.Lock()
	defer h.mu.Unlock()
	subs, ok := h.topics[sub.Topic]
	if !ok {
		return
	}
	if _, exists := subs[sub.ID]; !exists {
		return
	}
	delete(subs, sub.ID)
	close(sub.C)
	if len(subs) == 0 {
		delete(h.topics, sub.Topic)
	}
}

// Publish broadcasts payload to all current subscribers of topic. Slow
// subscribers are skipped (best effort). The optional skip ID is used when
// echoing back a message — a sender may not want to receive its own publish.
func (h *Hub) Publish(topic string, payload []byte, skip ...uint64) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	subs := h.topics[topic]
	if len(subs) == 0 {
		return
	}
	var skipID uint64
	if len(skip) > 0 {
		skipID = skip[0]
	}
	for id, sub := range subs {
		if skipID != 0 && id == skipID {
			continue
		}
		select {
		case sub.C <- payload:
		default:
			// drop — subscriber too slow
		}
	}
}
