package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/f0reachARR/video-manager/internal/hlswire"
)

// apiClient wraps the worker's HTTP calls to the API. All requests carry the
// shared bearer token.
type apiClient struct {
	base   string
	token  string
	client *http.Client
}

func newAPIClient(base, token string) *apiClient {
	return &apiClient{
		base:  base,
		token: token,
		// Long-poll on claim needs a generous client-side timeout; we set it
		// well above the server's MaxClaimWait so the connection survives.
		client: &http.Client{Timeout: 5 * time.Minute},
	}
}

func (c *apiClient) claim(ctx context.Context, req hlswire.ClaimRequest) (*hlswire.ClaimResponse, error) {
	var res hlswire.ClaimResponse
	status, err := c.do(ctx, http.MethodPost, "/internal/worker/jobs/claim", req, &res)
	if err != nil {
		return nil, err
	}
	if status == http.StatusNoContent {
		return nil, nil
	}
	return &res, nil
}

func (c *apiClient) heartbeat(ctx context.Context, jobID, token string) error {
	_, err := c.do(ctx, http.MethodPost,
		fmt.Sprintf("/internal/worker/jobs/%s/heartbeat", jobID),
		hlswire.LeaseAuth{LeaseToken: token},
		nil)
	return err
}

func (c *apiClient) progress(ctx context.Context, jobID string, body any) error {
	_, err := c.do(ctx, http.MethodPost,
		fmt.Sprintf("/internal/worker/jobs/%s/progress", jobID),
		body, nil)
	return err
}

func (c *apiClient) complete(ctx context.Context, jobID string, body any) error {
	_, err := c.do(ctx, http.MethodPost,
		fmt.Sprintf("/internal/worker/jobs/%s/complete", jobID),
		body, nil)
	return err
}

func (c *apiClient) fail(ctx context.Context, jobID, token, msg string) error {
	_, err := c.do(ctx, http.MethodPost,
		fmt.Sprintf("/internal/worker/jobs/%s/fail", jobID),
		hlswire.FailRequest{LeaseAuth: hlswire.LeaseAuth{LeaseToken: token}, Error: msg},
		nil)
	return err
}

// do performs a JSON request/response. When out is nil the body is discarded.
// Returns the HTTP status so callers can distinguish 204 from 200.
func (c *apiClient) do(ctx context.Context, method, path string, body any, out any) (int, error) {
	var rdr io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return 0, fmt.Errorf("marshal %s: %w", path, err)
		}
		rdr = bytes.NewReader(buf)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, rdr)
	if err != nil {
		return 0, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	resp, err := c.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		buf, _ := io.ReadAll(io.LimitReader(resp.Body, 8*1024))
		return resp.StatusCode, fmt.Errorf("%s %s: %d %s", method, path, resp.StatusCode, string(buf))
	}
	if out != nil && resp.StatusCode != http.StatusNoContent {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil && err != io.EOF {
			return resp.StatusCode, fmt.Errorf("decode %s: %w", path, err)
		}
	} else {
		_, _ = io.Copy(io.Discard, resp.Body)
	}
	return resp.StatusCode, nil
}
