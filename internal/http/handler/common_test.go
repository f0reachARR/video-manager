package handler

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

func TestEncodeDecodeCursorRoundTrip(t *testing.T) {
	id := pgtype.UUID{Bytes: uuid.New(), Valid: true}
	now := time.Now().UTC().Truncate(time.Microsecond)

	enc := encodeCursor(now, id)
	gotAt, gotID, err := decodeCursor(enc)
	if err != nil {
		t.Fatalf("decodeCursor: %v", err)
	}
	if !gotAt.Valid || !gotAt.Time.Equal(now) {
		t.Errorf("time round-trip mismatch: got %v want %v", gotAt.Time, now)
	}
	if uuidString(gotID) != uuidString(id) {
		t.Errorf("id round-trip mismatch")
	}
}

func TestDecodeCursorEmpty(t *testing.T) {
	at, id, err := decodeCursor("")
	if err != nil {
		t.Fatalf("decodeCursor(empty): %v", err)
	}
	if at.Valid || id.Valid {
		t.Errorf("empty cursor must yield invalid pgtypes")
	}
}

func TestDecodeCursorInvalid(t *testing.T) {
	for _, c := range []string{"not-base64!", "Zm9v"} {
		if _, _, err := decodeCursor(c); err == nil {
			t.Errorf("decodeCursor(%q) expected error", c)
		}
	}
}

func TestOptionalUnmarshal(t *testing.T) {
	type body struct {
		Color Optional[string] `json:"color"`
	}
	tests := []struct {
		name      string
		raw       string
		wantSet   bool
		wantNull  bool
		wantValue string
	}{
		{"missing", `{}`, false, false, ""},
		{"null", `{"color":null}`, true, true, ""},
		{"value", `{"color":"#fff"}`, true, false, "#fff"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var b body
			if err := json.Unmarshal([]byte(tc.raw), &b); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			if b.Color.Set != tc.wantSet {
				t.Errorf("Set: got %v want %v", b.Color.Set, tc.wantSet)
			}
			if b.Color.Null != tc.wantNull {
				t.Errorf("Null: got %v want %v", b.Color.Null, tc.wantNull)
			}
			if b.Color.Value != tc.wantValue {
				t.Errorf("Value: got %q want %q", b.Color.Value, tc.wantValue)
			}
		})
	}
}

func TestLimitFromQuery(t *testing.T) {
	cases := []struct {
		raw  string
		want int32
		ok   bool
	}{
		{"", defaultPageLimit, true},
		{"10", 10, true},
		{"9999", maxPageLimit, true},
		{"-1", 0, false},
		{"abc", 0, false},
	}
	for _, c := range cases {
		t.Run(c.raw, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/?limit="+c.raw, nil)
			got, err := limitFromQuery(r)
			if c.ok {
				if err != nil {
					t.Fatalf("unexpected err: %v", err)
				}
				if got != c.want {
					t.Errorf("got %d want %d", got, c.want)
				}
			} else if err == nil {
				t.Errorf("expected error for %q", c.raw)
			}
		})
	}
}

func TestPaginateTrimsAndEmitsCursor(t *testing.T) {
	type row struct{ id string }
	items := []row{{"a"}, {"b"}, {"c"}, {"d"}, {"e"}}
	page, pg := paginate(items, 3, func(r row) string { return "c-" + r.id })
	if len(page) != 3 {
		t.Fatalf("len page: got %d want 3", len(page))
	}
	if !pg.HasMore {
		t.Error("expected hasMore=true")
	}
	if pg.NextCursor == nil || *pg.NextCursor != "c-c" {
		t.Errorf("nextCursor: %v", pg.NextCursor)
	}

	page, pg = paginate(items[:2], 3, func(r row) string { return "c-" + r.id })
	if len(page) != 2 || pg.HasMore || pg.NextCursor != nil {
		t.Errorf("short page: page=%v pg=%+v", page, pg)
	}
}

func TestComputeSessionGap(t *testing.T) {
	mustTime := func(s string) time.Time {
		t.Helper()
		v, err := time.Parse(time.RFC3339, s)
		if err != nil {
			t.Fatalf("parse %q: %v", s, err)
		}
		return v
	}

	sess := func(start, end string) sqlc.Session {
		return sqlc.Session{
			StartedAt: pgtype.Timestamptz{Time: mustTime(start), Valid: true},
			EndedAt:   pgtype.Timestamptz{Time: mustTime(end), Valid: true},
		}
	}

	tests := []struct {
		name       string
		s          sqlc.Session
		videoStart string
		videoEnd   string
		want       time.Duration
	}{
		{
			name:       "overlap",
			s:          sess("2026-05-01T10:00:00Z", "2026-05-01T11:00:00Z"),
			videoStart: "2026-05-01T10:30:00Z",
			videoEnd:   "2026-05-01T10:31:00Z",
			want:       0,
		},
		{
			name:       "video before session",
			s:          sess("2026-05-01T11:00:00Z", "2026-05-01T12:00:00Z"),
			videoStart: "2026-05-01T10:30:00Z",
			videoEnd:   "2026-05-01T10:40:00Z",
			want:       20 * time.Minute,
		},
		{
			name:       "video after session",
			s:          sess("2026-05-01T10:00:00Z", "2026-05-01T10:30:00Z"),
			videoStart: "2026-05-01T11:00:00Z",
			videoEnd:   "2026-05-01T11:05:00Z",
			want:       30 * time.Minute,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := computeSessionGap(tc.s, mustTime(tc.videoStart), mustTime(tc.videoEnd))
			if got != tc.want {
				t.Errorf("gap = %v, want %v", got, tc.want)
			}
		})
	}
}
