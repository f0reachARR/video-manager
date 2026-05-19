package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// Provider wraps the OIDC verifier + oauth2 config so handlers don't have to
// know about either library directly.
type Provider struct {
	OIDC     *oidc.Provider
	Verifier *oidc.IDTokenVerifier
	OAuth    *oauth2.Config
}

// NewProvider performs OIDC discovery against issuerURL and returns a
// Provider ready for AuthCode + ID-Token verification.
func NewProvider(ctx context.Context, issuerURL, clientID, clientSecret, redirectURL string, scopes []string) (*Provider, error) {
	if issuerURL == "" {
		return nil, errors.New("oidc: issuer URL is empty")
	}
	prov, err := oidc.NewProvider(ctx, issuerURL)
	if err != nil {
		return nil, fmt.Errorf("oidc discovery: %w", err)
	}
	if len(scopes) == 0 {
		scopes = []string{oidc.ScopeOpenID, "profile", "email"}
	}
	cfg := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Endpoint:     prov.Endpoint(),
		RedirectURL:  redirectURL,
		Scopes:       scopes,
	}
	return &Provider{
		OIDC:     prov,
		Verifier: prov.Verifier(&oidc.Config{ClientID: clientID}),
		OAuth:    cfg,
	}, nil
}

// Claims is the subset of OIDC ID Token claims we care about.
type Claims struct {
	Subject       string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

// ---------- Auth flow helpers ----------

// AuthFlow holds the values an in-flight login depends on.
type AuthFlow struct {
	State        string // CSRF nonce returned by the IdP unchanged
	Nonce        string // OIDC nonce echoed in the ID Token
	CodeVerifier string // PKCE verifier; the IdP receives only its SHA-256 hash
	ReturnTo     string // SPA path to redirect to after callback
}

// StateCookieName is the transient cookie set during the auth dance.
const StateCookieName = "vm_auth_state"

// stateMaxAge bounds how long the user has to complete the IdP redirect dance.
const stateMaxAge = 10 * time.Minute

// NewFlow generates fresh random values for a login attempt.
func NewFlow(returnTo string) (AuthFlow, error) {
	state, err := randomURLSafe(32)
	if err != nil {
		return AuthFlow{}, err
	}
	nonce, err := randomURLSafe(32)
	if err != nil {
		return AuthFlow{}, err
	}
	verifier, err := randomURLSafe(64)
	if err != nil {
		return AuthFlow{}, err
	}
	return AuthFlow{
		State:        state,
		Nonce:        nonce,
		CodeVerifier: verifier,
		ReturnTo:     returnTo,
	}, nil
}

// CodeChallenge returns the S256 PKCE challenge for this flow.
func (f AuthFlow) CodeChallenge() string {
	h := sha256.Sum256([]byte(f.CodeVerifier))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

// EncodeStateCookie serializes an AuthFlow into the signed cookie value.
func EncodeStateCookie(s *Signer, f AuthFlow) string {
	// Order matters; mirror exactly in DecodeStateCookie.
	payload := strings.Join([]string{f.State, f.Nonce, f.CodeVerifier, f.ReturnTo}, "|")
	return s.SignString(payload)
}

// DecodeStateCookie validates the signature and parses the AuthFlow back out.
func DecodeStateCookie(s *Signer, value string) (AuthFlow, error) {
	payload, err := s.VerifyString(value)
	if err != nil {
		return AuthFlow{}, err
	}
	parts := strings.SplitN(payload, "|", 4)
	if len(parts) != 4 {
		return AuthFlow{}, errors.New("state cookie: malformed payload")
	}
	return AuthFlow{State: parts[0], Nonce: parts[1], CodeVerifier: parts[2], ReturnTo: parts[3]}, nil
}

// SetStateCookie installs the transient state cookie. Short MaxAge to bound
// the in-flight auth attempts.
func SetStateCookie(w http.ResponseWriter, value string, opt CookieOptions) {
	http.SetCookie(w, &http.Cookie{
		Name:     StateCookieName,
		Value:    value,
		Path:     "/",
		Domain:   opt.Domain,
		Secure:   opt.Secure,
		HttpOnly: true,
		SameSite: opt.SameSite,
		MaxAge:   int(stateMaxAge.Seconds()),
	})
}

// ClearStateCookie removes the transient cookie once we no longer need it
// (after the callback completes either successfully or with a failure).
func ClearStateCookie(w http.ResponseWriter, opt CookieOptions) {
	http.SetCookie(w, &http.Cookie{
		Name:     StateCookieName,
		Value:    "",
		Path:     "/",
		Domain:   opt.Domain,
		Secure:   opt.Secure,
		HttpOnly: true,
		SameSite: opt.SameSite,
		MaxAge:   -1,
	})
}

func randomURLSafe(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
