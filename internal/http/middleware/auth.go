// Package middleware contains HTTP middlewares used by the API router.
package middleware

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/f0reachARR/soiree/internal/auth"
	"github.com/f0reachARR/soiree/internal/db/sqlc"
)

// AuthDeps wires the auth middleware. Signer is required; Queries is required
// to look up users. DevBypass enables the legacy X-User-Id header path used
// for local dev / integration tests.
type AuthDeps struct {
	Q         *sqlc.Queries
	Signer    *auth.Signer
	DevBypass bool
}

// LoadUser reads the session cookie (or, when DevBypass is true, the
// X-User-Id header), looks up the user, and attaches them to the request
// context. Unauthenticated requests pass through unmodified — handlers that
// require auth should call `auth.UserFromContext(ctx)` and 401 themselves.
//
// This middleware never rejects a request itself; we want unauthenticated
// reads to flow through to handlers that may genuinely be public (health
// checks, login endpoints) and let each handler decide its own auth policy.
func LoadUser(deps AuthDeps) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			now := time.Now()

			if user := resolveSessionUser(r, deps, now); user != nil {
				ctx = auth.WithUser(ctx, user)
			} else if deps.DevBypass {
				if user := resolveHeaderUser(r, deps); user != nil {
					ctx = auth.WithUser(ctx, user)
				}
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func resolveSessionUser(r *http.Request, deps AuthDeps, now time.Time) *sqlc.User {
	if deps.Signer == nil {
		return nil
	}
	c, err := r.Cookie(auth.SessionCookieName)
	if err != nil || c.Value == "" {
		return nil
	}
	sess, err := deps.Signer.DecodeSession(c.Value)
	if err != nil {
		// Tampered or stale cookie — silently ignore so a corrupted cookie
		// just becomes an anonymous request, not a 500.
		slog.Debug("session cookie decode failed", "error", err)
		return nil
	}
	if sess.IsExpired(now) {
		return nil
	}
	return loadUser(r, deps, sess.UserID)
}

func resolveHeaderUser(r *http.Request, deps AuthDeps) *sqlc.User {
	v := strings.TrimSpace(r.Header.Get("X-User-Id"))
	if v == "" {
		return nil
	}
	return loadUser(r, deps, v)
}

// RequireAuth rejects requests that do not have a user attached by LoadUser.
// Must be mounted after LoadUser. Returns 401 with the standard error body.
func RequireAuth() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if auth.UserFromContext(r.Context()) == nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"code":"unauthorized","message":"authentication required"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func loadUser(r *http.Request, deps AuthDeps, idStr string) *sqlc.User {
	id, err := uuid.Parse(idStr)
	if err != nil {
		return nil
	}
	u, err := deps.Q.GetUser(r.Context(), pgtype.UUID{Bytes: id, Valid: true})
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			slog.Warn("auth middleware: user lookup failed", "error", err)
		}
		return nil
	}
	return &u
}
