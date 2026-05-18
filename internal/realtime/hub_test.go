package realtime

import (
	"testing"
	"time"
)

func TestHubFanOut(t *testing.T) {
	h := NewHub()
	a := h.Subscribe("topic-x")
	b := h.Subscribe("topic-x")
	defer h.Unsubscribe(a)
	defer h.Unsubscribe(b)

	h.Publish("topic-x", []byte("hello"))

	for _, sub := range []*Subscriber{a, b} {
		select {
		case msg := <-sub.C:
			if string(msg) != "hello" {
				t.Errorf("sub %d: got %q", sub.ID, msg)
			}
		case <-time.After(time.Second):
			t.Fatalf("sub %d timed out", sub.ID)
		}
	}
}

func TestHubSkipSender(t *testing.T) {
	h := NewHub()
	a := h.Subscribe("t")
	b := h.Subscribe("t")
	defer h.Unsubscribe(a)
	defer h.Unsubscribe(b)

	h.Publish("t", []byte("from-a"), a.ID)

	select {
	case msg := <-b.C:
		if string(msg) != "from-a" {
			t.Errorf("b: got %q", msg)
		}
	case <-time.After(time.Second):
		t.Fatal("b timed out")
	}
	select {
	case m := <-a.C:
		t.Errorf("a should not have received its own publish: %q", m)
	case <-time.After(100 * time.Millisecond):
		// expected
	}
}

func TestHubUnsubscribe(t *testing.T) {
	h := NewHub()
	sub := h.Subscribe("u")
	h.Unsubscribe(sub)
	// Publish should no-op (no panic from sending to closed channel).
	h.Publish("u", []byte("late"))
}

func TestHubIsolatedTopics(t *testing.T) {
	h := NewHub()
	a := h.Subscribe("alpha")
	b := h.Subscribe("beta")
	defer h.Unsubscribe(a)
	defer h.Unsubscribe(b)

	h.Publish("alpha", []byte("A"))
	h.Publish("beta", []byte("B"))

	select {
	case msg := <-a.C:
		if string(msg) != "A" {
			t.Errorf("a: %q", msg)
		}
	case <-time.After(time.Second):
		t.Fatal("a timed out")
	}
	select {
	case msg := <-b.C:
		if string(msg) != "B" {
			t.Errorf("b: %q", msg)
		}
	case <-time.After(time.Second):
		t.Fatal("b timed out")
	}
}
