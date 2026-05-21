package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"
)

type Config struct {
	HTTPAddr       string   `env:"HTTP_ADDR" envDefault:":8080"`
	AppVersion     string   `env:"APP_VERSION" envDefault:"0.1.0"`
	DatabaseURL    string   `env:"DATABASE_URL,required"`
	AllowedOrigins []string `env:"ALLOWED_ORIGINS" envSeparator:","`

	S3Endpoint     string        `env:"S3_ENDPOINT,required"`
	S3Region       string        `env:"S3_REGION" envDefault:"us-east-1"`
	S3Bucket       string        `env:"S3_BUCKET,required"`
	S3AccessKey    string        `env:"S3_ACCESS_KEY,required"`
	S3SecretKey    string        `env:"S3_SECRET_KEY,required"`
	S3UsePathStyle bool          `env:"S3_USE_PATH_STYLE" envDefault:"true"`
	S3PresignTTL   time.Duration `env:"S3_PRESIGN_TTL" envDefault:"10m"`

	// S3PresignEndpoint, when non-empty, overrides the BaseEndpoint of the
	// presign client only. Server-side operations (Put/Get/Delete/List) keep
	// going to S3Endpoint. Set this when S3Endpoint is a compose-internal
	// hostname (e.g. http://minio:9000) that the browser can't resolve, but
	// MinIO is reachable from the browser at a different URL (e.g.
	// http://localhost:9000 in dev, https://s3.example.com in prod).
	S3PresignEndpoint string `env:"S3_PRESIGN_ENDPOINT" envDefault:""`

	// HLSBaseURL overrides the base URL used when handing out HLS proxy
	// playback URLs. When empty, the URL is derived from the inbound request
	// (scheme + Host). Set this when the public-facing origin differs from
	// what r.Host reports, e.g. behind a CDN or when serving HLS from a
	// separate hostname. No trailing slash.
	HLSBaseURL string `env:"HLS_BASE_URL" envDefault:""`

	// Worker queue configuration. The app process polls "default" by default;
	// dedicated worker nodes can set WORKER_QUEUES="default,encode" (or just
	// "encode") to pull the heavy HLS encode jobs.
	WorkerQueues             []string `env:"WORKER_QUEUES" envDefault:"default" envSeparator:","`
	WorkerDefaultConcurrency int      `env:"WORKER_CONCURRENCY_DEFAULT" envDefault:"4"`
	WorkerEncodeConcurrency  int      `env:"WORKER_CONCURRENCY_ENCODE" envDefault:"1"`

	// HTTP API URL (used by worker nodes if they need to call back; reserved).
	APIBaseURL string `env:"API_BASE_URL" envDefault:""`

	// OIDC / authentication. When OIDCIssuerURL is empty, OIDC is disabled
	// entirely and only the dev-bypass path (X-User-Id header) works.
	OIDCIssuerURL     string   `env:"OIDC_ISSUER_URL" envDefault:""`
	OIDCClientID      string   `env:"OIDC_CLIENT_ID" envDefault:""`
	OIDCClientSecret  string   `env:"OIDC_CLIENT_SECRET" envDefault:""`
	OIDCRedirectURL   string   `env:"OIDC_REDIRECT_URL" envDefault:""`
	OIDCScopes        []string `env:"OIDC_SCOPES" envDefault:"openid,profile,email" envSeparator:","`
	OIDCPostLogoutURL string   `env:"OIDC_POST_LOGOUT_URL" envDefault:"/"`

	// SessionSecret signs session + transient state cookies (HMAC-SHA256).
	// Required when OIDC is enabled. Minimum recommended length: 32 bytes
	// random base64. If unset and OIDC is enabled, startup fails.
	SessionSecret  string        `env:"SESSION_SECRET" envDefault:""`
	SessionMaxAge  time.Duration `env:"SESSION_MAX_AGE" envDefault:"168h"`
	CookieSecure   bool          `env:"COOKIE_SECURE" envDefault:"true"`
	CookieDomain   string        `env:"COOKIE_DOMAIN" envDefault:""`
	CookieSameSite string        `env:"COOKIE_SAMESITE" envDefault:"lax"`

	// AuthDevBypass keeps the legacy X-User-Id header path working when set.
	// Intended for local dev / integration tests so we don't have to spin up
	// an IdP. Must be false in production.
	AuthDevBypass bool `env:"AUTH_DEV_BYPASS" envDefault:"false"`
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, fmt.Errorf("parse env: %w", err)
	}

	cfg.AllowedOrigins = trimAll(cfg.AllowedOrigins)
	cfg.HLSBaseURL = strings.TrimRight(strings.TrimSpace(cfg.HLSBaseURL), "/")
	cfg.WorkerQueues = trimAll(cfg.WorkerQueues)
	if len(cfg.WorkerQueues) == 0 {
		cfg.WorkerQueues = []string{"default"}
	}
	cfg.OIDCScopes = trimAll(cfg.OIDCScopes)
	if cfg.OIDCEnabled() {
		if cfg.OIDCClientID == "" || cfg.OIDCRedirectURL == "" {
			return nil, fmt.Errorf("OIDC enabled but OIDC_CLIENT_ID or OIDC_REDIRECT_URL is missing")
		}
		if cfg.SessionSecret == "" {
			return nil, fmt.Errorf("OIDC enabled but SESSION_SECRET is empty")
		}
	}
	return cfg, nil
}

// OIDCEnabled reports whether OIDC authentication should be wired up.
func (c *Config) OIDCEnabled() bool { return c.OIDCIssuerURL != "" }

func trimAll(in []string) []string {
	out := in[:0]
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}
