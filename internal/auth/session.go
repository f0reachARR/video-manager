// Package auth handles OIDC login, session cookies, and the per-request
// "who is the caller" lookup used by the HTTP layer.
//
// Sessions are stateless: a signed (HMAC-SHA256) cookie carries the user UUID
// and an expiry. There is no DB-backed session table, so logout just clears
// the cookie. If we ever need server-side revocation we can introduce a
// version column on `users` and include it in the cookie payload.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// SessionCookieName is the name of the long-lived signed cookie.
const SessionCookieName = "soiree_session"

// Session holds the data we serialize into the cookie.
type Session struct {
	UserID    string
	IssuedAt  time.Time
	ExpiresAt time.Time
}

// CookieOptions controls how all auth-related cookies are emitted. Cleaner
// than threading the same five fields through every Set/Clear call.
type CookieOptions struct {
	Secure   bool
	Domain   string
	SameSite http.SameSite
	MaxAge   time.Duration
}

// SameSiteFromString maps the human-readable env value to http.SameSite.
func SameSiteFromString(s string) http.SameSite {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "strict":
		return http.SameSiteStrictMode
	case "none":
		return http.SameSiteNoneMode
	default:
		return http.SameSiteLaxMode
	}
}

// Signer encapsulates the HMAC key used to sign session/state cookies.
type Signer struct {
	key []byte
}

func NewSigner(secret string) (*Signer, error) {
	if len(secret) < 16 {
		return nil, errors.New("session secret must be at least 16 chars")
	}
	return &Signer{key: []byte(secret)}, nil
}

// EncodeSession produces the cookie value for a session: payload + "." + sig.
// Payload is "userId:issuedUnix:expiresUnix". Both halves are base64url.
func (s *Signer) EncodeSession(sess Session) string {
	payload := fmt.Sprintf("%s:%d:%d", sess.UserID, sess.IssuedAt.Unix(), sess.ExpiresAt.Unix())
	return s.sign(payload)
}

// DecodeSession parses + verifies the cookie value, returning the session.
// Returns an error if the signature is bad or the payload is malformed.
// Expiry is NOT checked here — call IsExpired separately.
func (s *Signer) DecodeSession(value string) (Session, error) {
	payload, err := s.verify(value)
	if err != nil {
		return Session{}, err
	}
	parts := strings.SplitN(payload, ":", 3)
	if len(parts) != 3 {
		return Session{}, errors.New("session: malformed payload")
	}
	issued, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return Session{}, fmt.Errorf("session: bad issued_at: %w", err)
	}
	expires, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		return Session{}, fmt.Errorf("session: bad expires_at: %w", err)
	}
	return Session{
		UserID:    parts[0],
		IssuedAt:  time.Unix(issued, 0),
		ExpiresAt: time.Unix(expires, 0),
	}, nil
}

// SignString HMAC-signs an arbitrary payload (used for the transient
// state/PKCE cookie). The result is the same format as session cookies.
func (s *Signer) SignString(payload string) string { return s.sign(payload) }

// VerifyString is the inverse of SignString.
func (s *Signer) VerifyString(value string) (string, error) { return s.verify(value) }

func (s *Signer) sign(payload string) string {
	m := hmac.New(sha256.New, s.key)
	m.Write([]byte(payload))
	sig := m.Sum(nil)
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." +
		base64.RawURLEncoding.EncodeToString(sig)
}

func (s *Signer) verify(value string) (string, error) {
	parts := strings.SplitN(value, ".", 2)
	if len(parts) != 2 {
		return "", errors.New("signed value: missing signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", fmt.Errorf("signed value: bad payload: %w", err)
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("signed value: bad signature: %w", err)
	}
	m := hmac.New(sha256.New, s.key)
	m.Write(payload)
	want := m.Sum(nil)
	if !hmac.Equal(sig, want) {
		return "", errors.New("signed value: signature mismatch")
	}
	return string(payload), nil
}

// SetSessionCookie writes the signed session cookie to the response.
func SetSessionCookie(w http.ResponseWriter, value string, opt CookieOptions) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    value,
		Path:     "/",
		Domain:   opt.Domain,
		Secure:   opt.Secure,
		HttpOnly: true,
		SameSite: opt.SameSite,
		MaxAge:   int(opt.MaxAge.Seconds()),
	})
}

// ClearSessionCookie tells the browser to drop the session cookie.
func ClearSessionCookie(w http.ResponseWriter, opt CookieOptions) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		Domain:   opt.Domain,
		Secure:   opt.Secure,
		HttpOnly: true,
		SameSite: opt.SameSite,
		MaxAge:   -1,
	})
}

// IsExpired reports whether a session has already expired.
func (s Session) IsExpired(now time.Time) bool {
	return !s.ExpiresAt.IsZero() && now.After(s.ExpiresAt)
}
