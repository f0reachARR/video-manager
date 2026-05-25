package handler_test

import (
	"context"
	"encoding/hex"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type bulkCheckResult struct {
	HeadHashHex  string  `json:"headHashHex"`
	SizeBytes    int64   `json:"sizeBytes"`
	Known        bool    `json:"known"`
	MediaKind    *string `json:"mediaKind,omitempty"`
	VideoID      *string `json:"videoId"`
	RobotImageID *string `json:"robotImageId"`
	Filename     *string `json:"filename"`
}

type bulkCheckResp struct {
	Results []bulkCheckResult `json:"results"`
}

func hashHex(seed byte) string {
	b := make([]byte, 32)
	for i := range b {
		b[i] = seed
	}
	return hex.EncodeToString(b)
}

func mustUUID(t *testing.T, s string) pgtype.UUID {
	t.Helper()
	u, err := uuid.Parse(s)
	if err != nil {
		t.Fatalf("parse uuid: %v", err)
	}
	return pgtype.UUID{Bytes: u, Valid: true}
}

func TestBulkUploadCheckReturnsUnknownForNewFingerprints(t *testing.T) {
	env := setupEnv(t)

	var tour tournamentResp
	mustCreate(t, env, http.MethodPost, "/tournaments", map[string]any{"name": "T1"}, &tour)

	var resp bulkCheckResp
	rec := env.do(t, http.MethodPost,
		"/tournaments/"+tour.ID+"/bulk-uploads/check",
		map[string]any{
			"items": []map[string]any{
				{"headHashHex": hashHex(0x01), "sizeBytes": 1000, "filename": "a.mp4", "mediaKind": "video"},
				{"headHashHex": hashHex(0x02), "sizeBytes": 2000, "filename": "b.mp4", "mediaKind": "video"},
			},
		}, &resp)
	mustStatus(t, rec, http.StatusOK)
	if len(resp.Results) != 2 || resp.Results[0].Known || resp.Results[1].Known {
		t.Fatalf("expected both unknown, got %+v", resp)
	}
}

func TestBulkUploadCheckRecognizesRegisteredVideo(t *testing.T) {
	env := setupEnv(t)
	ctx := t.Context()

	var tour tournamentResp
	mustCreate(t, env, http.MethodPost, "/tournaments", map[string]any{"name": "T1"}, &tour)
	tid := mustUUID(t, tour.ID)

	// Insert a video row directly so we have a target for the fingerprint.
	// Using raw SQL keeps the test independent of the tus hook flow.
	var videoID pgtype.UUID
	if err := env.Pool.QueryRow(ctx,
		`INSERT INTO videos (storage_key, tournament_id) VALUES ($1, $2) RETURNING id`,
		"test/key/abc", tid).Scan(&videoID); err != nil {
		t.Fatalf("insert video: %v", err)
	}

	headHashHex := hashHex(0x42)
	headHashBytes, _ := hex.DecodeString(headHashHex)

	// Register the fingerprint via the handler's exported helper (the same
	// path the tus hook will take in production).
	if _, err := env.Pool.Exec(ctx, `INSERT INTO bulk_upload_fingerprints (tournament_id, head_hash, size_bytes, filename, media_kind, video_id)
		VALUES ($1, $2, $3, $4, 'video', $5)`,
		tid, headHashBytes, int64(12345), "movie.mp4", videoID); err != nil {
		t.Fatalf("seed fingerprint: %v", err)
	}

	var resp bulkCheckResp
	rec := env.do(t, http.MethodPost,
		"/tournaments/"+tour.ID+"/bulk-uploads/check",
		map[string]any{
			"items": []map[string]any{
				{"headHashHex": headHashHex, "sizeBytes": 12345, "filename": "movie.mp4", "mediaKind": "video"},
				{"headHashHex": hashHex(0x99), "sizeBytes": 12345, "filename": "other.mp4", "mediaKind": "video"},
			},
		}, &resp)
	mustStatus(t, rec, http.StatusOK)
	if len(resp.Results) != 2 {
		t.Fatalf("expected 2 results, got %+v", resp)
	}
	if !resp.Results[0].Known || resp.Results[0].VideoID == nil {
		t.Errorf("expected first result known with videoId, got %+v", resp.Results[0])
	}
	if resp.Results[1].Known {
		t.Errorf("expected second result unknown, got %+v", resp.Results[1])
	}
}

func TestBulkUploadCheckIsolatedPerTournament(t *testing.T) {
	env := setupEnv(t)
	ctx := t.Context()

	var t1, t2 tournamentResp
	mustCreate(t, env, http.MethodPost, "/tournaments", map[string]any{"name": "T1"}, &t1)
	mustCreate(t, env, http.MethodPost, "/tournaments", map[string]any{"name": "T2"}, &t2)

	hh := hashHex(0x7f)
	hhBytes, _ := hex.DecodeString(hh)
	tid1 := mustUUID(t, t1.ID)
	if _, err := env.Pool.Exec(ctx, `INSERT INTO bulk_upload_fingerprints (tournament_id, head_hash, size_bytes, filename, media_kind)
		VALUES ($1, $2, $3, 'x.mp4', 'video')`, tid1, hhBytes, int64(1)); err != nil {
		t.Fatalf("seed fingerprint: %v", err)
	}

	// Same hash queried under T2 is unknown.
	var resp bulkCheckResp
	rec := env.do(t, http.MethodPost,
		"/tournaments/"+t2.ID+"/bulk-uploads/check",
		map[string]any{"items": []map[string]any{
			{"headHashHex": hh, "sizeBytes": 1, "filename": "x.mp4", "mediaKind": "video"},
		}}, &resp)
	mustStatus(t, rec, http.StatusOK)
	if resp.Results[0].Known {
		t.Errorf("expected fingerprint not known under T2")
	}
}

func TestBulkUploadCheckRejectsInvalidHex(t *testing.T) {
	env := setupEnv(t)
	var tour tournamentResp
	mustCreate(t, env, http.MethodPost, "/tournaments", map[string]any{"name": "T1"}, &tour)

	rec := env.do(t, http.MethodPost,
		"/tournaments/"+tour.ID+"/bulk-uploads/check",
		map[string]any{"items": []map[string]any{
			{"headHashHex": "shorthash", "sizeBytes": 1, "filename": "x", "mediaKind": "video"},
		}}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d", rec.Code)
	}
}

func TestBulkUploadClearFingerprints(t *testing.T) {
	env := setupEnv(t)
	ctx := t.Context()

	var tour tournamentResp
	mustCreate(t, env, http.MethodPost, "/tournaments", map[string]any{"name": "T1"}, &tour)
	tid := mustUUID(t, tour.ID)

	hh := hashHex(0x33)
	hhBytes, _ := hex.DecodeString(hh)
	if _, err := env.Pool.Exec(ctx, `INSERT INTO bulk_upload_fingerprints (tournament_id, head_hash, size_bytes, filename, media_kind)
		VALUES ($1, $2, $3, 'x.mp4', 'video')`, tid, hhBytes, int64(1)); err != nil {
		t.Fatalf("seed fingerprint: %v", err)
	}

	rec := env.do(t, http.MethodDelete,
		"/tournaments/"+tour.ID+"/bulk-uploads/fingerprints", nil, nil)
	mustStatus(t, rec, http.StatusNoContent)

	var n int
	if err := env.Pool.QueryRow(context.Background(),
		`SELECT count(*) FROM bulk_upload_fingerprints WHERE tournament_id = $1`,
		tid).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Errorf("expected 0 rows after clear, got %d", n)
	}
}

func TestBulkUploadCheck404OnUnknownTournament(t *testing.T) {
	env := setupEnv(t)
	rec := env.do(t, http.MethodPost,
		"/tournaments/00000000-0000-0000-0000-000000000000/bulk-uploads/check",
		map[string]any{"items": []map[string]any{}}, nil)
	mustStatus(t, rec, http.StatusNotFound)
}
