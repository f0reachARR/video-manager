package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/oauth2"

	"github.com/f0reachARR/video-manager/internal/auth"
	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

// Auth wires the OIDC-backed login flow plus a /me endpoint.
//
// When Provider is nil OIDC is disabled and /auth/login returns 503. /auth/me
// still works because auth middleware may have resolved a user via the
// dev-bypass (X-User-Id) path.
type Auth struct {
	Q             *sqlc.Queries
	Provider      *auth.Provider
	Signer        *auth.Signer
	Cookie        auth.CookieOptions
	SessionMaxAge time.Duration
	PostLogoutURL string
	DevBypass     bool
}

// Config tells the SPA which login mechanisms are available so it can render
// the right login affordances without trial-and-error.
func (h *Auth) Config(w http.ResponseWriter, _ *http.Request) {
	type configResp struct {
		OIDCEnabled      bool   `json:"oidcEnabled"`
		DevBypassEnabled bool   `json:"devBypassEnabled"`
		LoginURL         string `json:"loginUrl"`
	}
	writeJSON(w, http.StatusOK, configResp{
		OIDCEnabled:      h.Provider != nil,
		DevBypassEnabled: h.DevBypass,
		LoginURL:         "/auth/login",
	})
}

// Login starts the Authorization Code + PKCE flow. The optional `return_to`
// query parameter is preserved in the state cookie so we can bounce the user
// back to the page they tried to load after the IdP round-trip.
func (h *Auth) Login(w http.ResponseWriter, r *http.Request) {
	if h.Provider == nil {
		writeError(w, http.StatusServiceUnavailable, "oidc_disabled", "OIDC is not configured", nil)
		return
	}
	returnTo := safeReturnTo(r.URL.Query().Get("return_to"))
	flow, err := auth.NewFlow(returnTo)
	if err != nil {
		internalError(w, err)
		return
	}
	auth.SetStateCookie(w, auth.EncodeStateCookie(h.Signer, flow), h.Cookie)

	authURL := h.Provider.OAuth.AuthCodeURL(flow.State,
		oauth2.AccessTypeOnline,
		oauth2.SetAuthURLParam("nonce", flow.Nonce),
		oauth2.SetAuthURLParam("code_challenge", flow.CodeChallenge()),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
	)
	http.Redirect(w, r, authURL, http.StatusFound)
}

// Callback completes the OIDC dance: validates state + ID Token, resolves /
// auto-provisions the user, then issues a session cookie and redirects to
// the path captured at /auth/login time.
func (h *Auth) Callback(w http.ResponseWriter, r *http.Request) {
	if h.Provider == nil {
		writeError(w, http.StatusServiceUnavailable, "oidc_disabled", "OIDC is not configured", nil)
		return
	}
	ctx := r.Context()

	// Always wipe the transient state cookie — whether we succeed or fail it
	// must not be replayable.
	defer auth.ClearStateCookie(w, h.Cookie)

	cookie, err := r.Cookie(auth.StateCookieName)
	if err != nil {
		unauthorized(w, "missing auth state cookie")
		return
	}
	flow, err := auth.DecodeStateCookie(h.Signer, cookie.Value)
	if err != nil {
		unauthorized(w, "invalid auth state cookie")
		return
	}
	if got := r.URL.Query().Get("state"); got != flow.State {
		unauthorized(w, "state mismatch")
		return
	}
	if errParam := r.URL.Query().Get("error"); errParam != "" {
		writeError(w, http.StatusUnauthorized, "oidc_error",
			fmt.Sprintf("%s: %s", errParam, r.URL.Query().Get("error_description")), nil)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		badRequest(w, "missing code")
		return
	}

	tok, err := h.Provider.OAuth.Exchange(ctx, code,
		oauth2.SetAuthURLParam("code_verifier", flow.CodeVerifier),
	)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "oidc_exchange", err.Error(), nil)
		return
	}
	rawIDToken, _ := tok.Extra("id_token").(string)
	if rawIDToken == "" {
		writeError(w, http.StatusUnauthorized, "oidc_no_id_token", "id_token missing from token response", nil)
		return
	}
	idTok, err := h.Provider.Verifier.Verify(ctx, rawIDToken)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "oidc_verify", err.Error(), nil)
		return
	}
	if idTok.Nonce != flow.Nonce {
		unauthorized(w, "nonce mismatch")
		return
	}
	var claims auth.Claims
	if err := idTok.Claims(&claims); err != nil {
		internalError(w, fmt.Errorf("claim decode: %w", err))
		return
	}
	if claims.Subject == "" {
		unauthorized(w, "id_token has empty sub")
		return
	}

	user, err := h.resolveUser(ctx, claims)
	if err != nil {
		internalError(w, fmt.Errorf("resolve user: %w", err))
		return
	}

	// Issue session cookie. ID/refresh tokens are not stored — re-login
	// happens via cookie expiry.
	now := time.Now()
	sess := auth.Session{
		UserID:    uuidString(user.ID),
		IssuedAt:  now,
		ExpiresAt: now.Add(h.SessionMaxAge),
	}
	auth.SetSessionCookie(w, h.Signer.EncodeSession(sess), withMaxAge(h.Cookie, h.SessionMaxAge))

	http.Redirect(w, r, flow.ReturnTo, http.StatusFound)
}

// Logout clears the session cookie. We intentionally do not call the IdP's
// end_session_endpoint (RP-Initiated Logout) — for self-hosted teams this is
// rarely what you want.
func (h *Auth) Logout(w http.ResponseWriter, _ *http.Request) {
	auth.ClearSessionCookie(w, h.Cookie)
	writeNoContent(w)
}

// Me returns the authenticated user (resolved by middleware) or 401.
func (h *Auth) Me(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	if u == nil {
		unauthorized(w, "not authenticated")
		return
	}
	writeJSON(w, http.StatusOK, toUserDTO(*u))
}

// resolveUser finds the user behind the claims, linking by email when an
// existing record matches, or creating a fresh row when nothing matches.
func (h *Auth) resolveUser(ctx context.Context, c auth.Claims) (*sqlc.User, error) {
	// Fast path: already linked.
	if u, err := h.Q.GetUserByOIDCSub(ctx, &c.Subject); err == nil {
		return &u, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	// Try to link by verified email.
	if c.Email != "" {
		if u, err := h.Q.GetUserByEmail(ctx, c.Email); err == nil {
			linked, err := h.Q.LinkUserOIDC(ctx, sqlc.LinkUserOIDCParams{
				ID:       u.ID,
				OidcSub:  c.Subject,
				Email:    nonEmpty(c.Email),
				Name:     nonEmpty(c.Name),
			})
			if err != nil {
				return nil, fmt.Errorf("link user: %w", err)
			}
			return &linked, nil
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
	}

	// No match — auto-provision. Use claim name when present; fall back to
	// the local-part of the email, then the sub.
	name := c.Name
	if name == "" {
		name = nameFromEmail(c.Email)
	}
	if name == "" {
		name = c.Subject
	}
	created, err := h.Q.CreateUserFromOIDC(ctx, sqlc.CreateUserFromOIDCParams{
		Name:    name,
		OidcSub: &c.Subject,
		Email:   nonEmpty(c.Email),
	})
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	slog.Info("provisioned user from OIDC", "sub", c.Subject, "email", c.Email, "userId", uuidString(created.ID))
	return &created, nil
}

func nonEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func nameFromEmail(email string) string {
	if email == "" {
		return ""
	}
	if i := strings.IndexByte(email, '@'); i > 0 {
		return email[:i]
	}
	return ""
}

func withMaxAge(c auth.CookieOptions, d time.Duration) auth.CookieOptions {
	c.MaxAge = d
	return c
}

// safeReturnTo guards against open-redirect: only allow paths starting with
// "/" and lacking "//" or "\\", i.e. same-origin SPA routes.
func safeReturnTo(raw string) string {
	if raw == "" {
		return "/"
	}
	u, err := url.Parse(raw)
	if err != nil || u.IsAbs() || u.Host != "" {
		return "/"
	}
	if !strings.HasPrefix(raw, "/") || strings.HasPrefix(raw, "//") || strings.Contains(raw, "\\") {
		return "/"
	}
	return raw
}

// satisfy unused-import linter while keeping pgtype reachable for future
// query params on this handler.
var _ pgtype.UUID