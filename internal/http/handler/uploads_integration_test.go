package handler_test

import (
	"net/http"
	"testing"
)

type tusHookResp struct {
	VideoID *string `json:"videoId"`
}

// post-finish hook payload that mirrors tusd v2's JSON shape.
func tusHookBody(uploadID, tournamentID string) map[string]any {
	return map[string]any{
		"Type": "post-finish",
		"Event": map[string]any{
			"Upload": map[string]any{
				"ID":   uploadID,
				"Size": 100,
				"MetaData": map[string]string{
					"filename":     "x.mp4",
					"filetype":     "video/mp4",
					"tournamentId": tournamentID,
				},
				"Storage": map[string]string{
					"Type":   "s3store",
					"Bucket": "videos",
					"Key":    uploadID,
				},
			},
		},
	}
}

func TestTusHookCreatesVideoAndEnqueuesProbe(t *testing.T) {
	env := setupEnv(t)
	tournamentID := env.createTournament(t, "T")
	var resp tusHookResp
	rec := env.do(t, http.MethodPost, "/uploads/tus-hook", tusHookBody("upload-abc", tournamentID), &resp)
	mustStatus(t, rec, http.StatusOK)
	if resp.VideoID == nil {
		t.Fatal("videoId missing from response")
	}
	if len(env.Enqueuer.calls) != 1 || env.Enqueuer.calls[0] != *resp.VideoID {
		t.Errorf("enqueue calls: %v", env.Enqueuer.calls)
	}

	// row exists with the expected storage_key
	var key string
	if err := env.Pool.QueryRow(t.Context(),
		`SELECT storage_key FROM videos WHERE id = $1`, *resp.VideoID).Scan(&key); err != nil {
		t.Fatalf("query video: %v", err)
	}
	if key != "upload-abc" {
		t.Errorf("storage_key: got %q want upload-abc", key)
	}
}

func TestTusHookIdempotent(t *testing.T) {
	env := setupEnv(t)
	tournamentID := env.createTournament(t, "T")
	var first tusHookResp
	rec := env.do(t, http.MethodPost, "/uploads/tus-hook", tusHookBody("upload-dup", tournamentID), &first)
	mustStatus(t, rec, http.StatusOK)

	var second tusHookResp
	rec = env.do(t, http.MethodPost, "/uploads/tus-hook", tusHookBody("upload-dup", tournamentID), &second)
	mustStatus(t, rec, http.StatusOK)
	if first.VideoID == nil || second.VideoID == nil || *first.VideoID != *second.VideoID {
		t.Errorf("expected same videoId, got %v vs %v", first.VideoID, second.VideoID)
	}

	// Re-running the hook shouldn't enqueue another probe (we already had a row).
	if len(env.Enqueuer.calls) != 1 {
		t.Errorf("enqueue calls: %v", env.Enqueuer.calls)
	}

	var count int
	if err := env.Pool.QueryRow(t.Context(),
		`SELECT count(*) FROM videos WHERE storage_key = $1`, "upload-dup").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Errorf("expected 1 row, got %d", count)
	}
}

func TestTusHookIgnoresNonPostFinish(t *testing.T) {
	env := setupEnv(t)
	tournamentID := env.createTournament(t, "T")
	body := tusHookBody("pre-x", tournamentID)
	body["Type"] = "pre-create"
	rec := env.do(t, http.MethodPost, "/uploads/tus-hook", body, nil)
	mustStatus(t, rec, http.StatusOK)
	if len(env.Enqueuer.calls) != 0 {
		t.Errorf("unexpected enqueue: %v", env.Enqueuer.calls)
	}
}
