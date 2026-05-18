package ffmpeg

import (
	"testing"
	"time"
)

func TestParseExtractsDurationAndCreationTime(t *testing.T) {
	raw := []byte(`{
		"format": {
			"duration": "12.345",
			"tags": { "creation_time": "2026-05-01T10:30:00.000000Z" }
		},
		"streams": []
	}`)
	m, err := parse(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if m.DurationSec == nil || *m.DurationSec != 12 {
		t.Errorf("duration: got %v want 12", m.DurationSec)
	}
	if m.RecordedAt == nil {
		t.Fatal("expected recorded_at to be set")
	}
	want := time.Date(2026, 5, 1, 10, 30, 0, 0, time.UTC)
	if !m.RecordedAt.Equal(want) {
		t.Errorf("recorded_at: got %v want %v", m.RecordedAt, want)
	}
}

func TestParseFallsBackToStreamCreationTime(t *testing.T) {
	raw := []byte(`{
		"format": { "duration": "5.5" },
		"streams": [
			{ "tags": { "creation_time": "2026-05-01T11:00:00Z" } }
		]
	}`)
	m, err := parse(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if m.RecordedAt == nil {
		t.Fatal("expected recorded_at from stream tags")
	}
	if m.RecordedAt.Hour() != 11 {
		t.Errorf("recorded_at hour: got %d want 11", m.RecordedAt.Hour())
	}
}

func TestParseHandlesMissingDuration(t *testing.T) {
	raw := []byte(`{"format": {"tags": {}}, "streams": []}`)
	m, err := parse(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if m.DurationSec != nil {
		t.Errorf("expected nil duration, got %d", *m.DurationSec)
	}
	if m.RecordedAt != nil {
		t.Errorf("expected nil recorded_at, got %v", m.RecordedAt)
	}
}

func TestParseRoundsDurationToNearestSecond(t *testing.T) {
	raw := []byte(`{"format": {"duration": "0.4"}, "streams": []}`)
	m, err := parse(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if m.DurationSec == nil || *m.DurationSec != 0 {
		t.Errorf("0.4s should round to 0; got %v", m.DurationSec)
	}

	raw = []byte(`{"format": {"duration": "0.6"}, "streams": []}`)
	m, err = parse(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if m.DurationSec == nil || *m.DurationSec != 1 {
		t.Errorf("0.6s should round to 1; got %v", m.DurationSec)
	}
}

func TestParseInvalidJSON(t *testing.T) {
	if _, err := parse([]byte("not json")); err == nil {
		t.Error("expected error on invalid JSON")
	}
}
