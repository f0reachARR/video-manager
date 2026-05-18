package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/f0reachARR/video-manager/internal/config"
	"github.com/f0reachARR/video-manager/internal/db"
	"github.com/f0reachARR/video-manager/internal/db/sqlc"
	"github.com/f0reachARR/video-manager/internal/http/handler"
	"github.com/f0reachARR/video-manager/internal/http/route"
	"github.com/f0reachARR/video-manager/internal/realtime"
	"github.com/f0reachARR/video-manager/internal/storage"
	"github.com/f0reachARR/video-manager/internal/worker"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	if err := run(); err != nil {
		logger.Error("application terminated", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	database, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer database.Close()

	q := sqlc.New(database.Pool)

	store, err := storage.New(ctx, storage.Config{
		Endpoint:     cfg.S3Endpoint,
		Region:       cfg.S3Region,
		Bucket:       cfg.S3Bucket,
		AccessKey:    cfg.S3AccessKey,
		SecretKey:    cfg.S3SecretKey,
		UsePathStyle: cfg.S3UsePathStyle,
		PresignTTL:   cfg.S3PresignTTL,
	})
	if err != nil {
		return err
	}

	hub := realtime.NewHub()

	workers, err := worker.Setup(ctx, database.Pool, q, store)
	if err != nil {
		return err
	}
	if err := workers.Start(ctx); err != nil {
		return err
	}
	defer func() {
		stopCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := workers.Stop(stopCtx); err != nil {
			slog.Warn("river stop error", "error", err)
		}
	}()

	router := route.New(route.Deps{
		Health: &handler.Health{
			Version: cfg.AppVersion,
			DB:      database,
		},
		Users:          &handler.Users{Q: q},
		Devices:        &handler.Devices{Q: q},
		Teams:          &handler.Teams{Q: q},
		Robots:         &handler.Robots{Q: q},
		Scenarios:      &handler.Scenarios{Q: q},
		Tags:           &handler.Tags{Q: q},
		Sessions:       &handler.Sessions{Q: q},
		Videos:         &handler.Videos{Q: q, Storage: store},
		Runs:           &handler.Runs{Q: q},
		Markers:        &handler.Markers{Q: q, Hub: hub},
		Tournaments:    &handler.Tournaments{Q: q},
		Matches:        &handler.Matches{Q: q},
		Annotations:    &handler.Annotations{Q: q},
		WS:             &handler.WS{Hub: hub, AllowedOrigins: cfg.AllowedOrigins},
		Uploads:        &handler.Uploads{Q: q, Worker: workers},
		AllowedOrigins: cfg.AllowedOrigins,
	})

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("http server listening", "addr", cfg.HTTPAddr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case <-ctx.Done():
		slog.Info("shutdown signal received")
	case err := <-errCh:
		if err != nil {
			return err
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}
