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

	// Worker queue configuration. The app process polls "default" by default;
	// dedicated worker nodes can set WORKER_QUEUES="default,encode" (or just
	// "encode") to pull the heavy HLS encode jobs.
	WorkerQueues             []string `env:"WORKER_QUEUES" envDefault:"default" envSeparator:","`
	WorkerDefaultConcurrency int      `env:"WORKER_CONCURRENCY_DEFAULT" envDefault:"4"`
	WorkerEncodeConcurrency  int      `env:"WORKER_CONCURRENCY_ENCODE" envDefault:"1"`

	// HTTP API URL (used by worker nodes if they need to call back; reserved).
	APIBaseURL string `env:"API_BASE_URL" envDefault:""`
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, fmt.Errorf("parse env: %w", err)
	}

	cfg.AllowedOrigins = trimAll(cfg.AllowedOrigins)
	cfg.WorkerQueues = trimAll(cfg.WorkerQueues)
	if len(cfg.WorkerQueues) == 0 {
		cfg.WorkerQueues = []string{"default"}
	}
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
