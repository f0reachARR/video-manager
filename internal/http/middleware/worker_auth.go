package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"
)

// WorkerAuth gates the /internal/worker/jobs/* routes with a shared bearer
// token (set via WORKER_AUTH_TOKEN). When the configured token is empty the
// middleware refuses every request — operators must explicitly enable the
// worker API by setting a token to avoid accidentally exposing it during
// rollout.
func WorkerAuth(token string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if token == "" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusServiceUnavailable)
				_, _ = w.Write([]byte(`{"code":"worker_disabled","message":"WORKER_AUTH_TOKEN is not set"}`))
				return
			}
			h := r.Header.Get("Authorization")
			const prefix = "Bearer "
			if !strings.HasPrefix(h, prefix) || subtle.ConstantTimeCompare([]byte(h[len(prefix):]), []byte(token)) != 1 {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"code":"unauthorized","message":"invalid worker token"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
