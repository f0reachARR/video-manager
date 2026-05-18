package config

import (
	"fmt"
	"strings"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"
)

type Config struct {
	HTTPAddr       string   `env:"HTTP_ADDR" envDefault:":8080"`
	AppVersion     string   `env:"APP_VERSION" envDefault:"0.1.0"`
	DatabaseURL    string   `env:"DATABASE_URL,required"`
	AllowedOrigins []string `env:"ALLOWED_ORIGINS" envSeparator:","`
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
