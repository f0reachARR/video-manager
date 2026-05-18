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

	S3Endpoint      string        `env:"S3_ENDPOINT,required"`
	S3Region        string        `env:"S3_REGION" envDefault:"us-east-1"`
	S3Bucket        string        `env:"S3_BUCKET,required"`
	S3AccessKey     string        `env:"S3_ACCESS_KEY,required"`
	S3SecretKey     string        `env:"S3_SECRET_KEY,required"`
	S3UsePathStyle  bool          `env:"S3_USE_PATH_STYLE" envDefault:"true"`
	S3PresignTTL    time.Duration `env:"S3_PRESIGN_TTL" envDefault:"10m"`
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, fmt.Errorf("parse env: %w", err)
	}

	cfg.AllowedOrigins = trimAll(cfg.AllowedOrigins)
	return cfg, nil
}

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
