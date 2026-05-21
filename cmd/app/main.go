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

	"github.com/f0reachARR/video-manager/internal/auth"
	"github.com/f0reachARR/video-manager/internal/config"
	"github.com/f0reachARR/video-manager/internal/db"
	"github.com/f0reachARR/video-manager/internal/db/sqlc"
	"github.com/f0reachARR/video-manager/internal/http/handler"
	appmid "github.com/f0reachARR/video-manager/internal/http/middleware"
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
		Endpoint:        cfg.S3Endpoint,
		Region:          cfg.S3Region,
		Bucket:          cfg.S3Bucket,
		AccessKey:       cfg.S3AccessKey,
		SecretKey:       cfg.S3SecretKey,
		UsePathStyle:    cfg.S3UsePathStyle,
		PresignTTL:      cfg.S3PresignTTL,
		PresignEndpoint: cfg.S3PresignEndpoint,
	})
	if err != nil {
		return err
	}

	hub := realtime.NewHub()

	// Auth: build a Signer if a session secret is configured (either OIDC is
	// on, or dev-bypass wants signed cookies in the future). If OIDC is on we
	// also perform discovery against the IdP up front so misconfigured
	// deployments fail fast.
	var signer *auth.Signer
	var oidcProvider *auth.Provider
	var authHandler *handler.Auth
	if cfg.SessionSecret != "" {
		s, err := auth.NewSigner(cfg.SessionSecret)
		if err != nil {
			return err
		}
		signer = s
	}
	if cfg.OIDCEnabled() {
		p, err := auth.NewProvider(ctx, cfg.OIDCIssuerURL, cfg.OIDCClientID, cfg.OIDCClientSecret, cfg.OIDCRedirectURL, cfg.OIDCScopes)
		if err != nil {
			return err
		}
		oidcProvider = p
	}
	cookie := auth.CookieOptions{
		Secure:   cfg.CookieSecure,
		Domain:   cfg.CookieDomain,
		SameSite: auth.SameSiteFromString(cfg.CookieSameSite),
	}
	// We always expose Auth so /auth/me and /auth/config work even when OIDC
	// is disabled (e.g. dev with bypass). /auth/login + /auth/callback gate
	// themselves on Provider != nil.
	authHandler = &handler.Auth{
		Q:             q,
		Provider:      oidcProvider,
		Signer:        signer,
		Cookie:        cookie,
		SessionMaxAge: cfg.SessionMaxAge,
		PostLogoutURL: cfg.OIDCPostLogoutURL,
		DevBypass:     cfg.AuthDevBypass,
	}

	workers, err := worker.Setup(ctx, database.Pool, q, store, worker.Config{
		Queues:             cfg.WorkerQueues,
		DefaultConcurrency: cfg.WorkerDefaultConcurrency,
		EncodeConcurrency:  cfg.WorkerEncodeConcurrency,
	})
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
		Videos:         &handler.Videos{Q: q, Storage: store, HLSBaseURL: cfg.HLSBaseURL},
		Runs:           &handler.Runs{Q: q},
		Markers:        &handler.Markers{Q: q, Hub: hub},
		Tournaments:    &handler.Tournaments{Q: q, Pool: database.Pool},
		BulkUploads:    &handler.BulkUploads{Q: q},
		Matches:        &handler.Matches{Q: q},
		Annotations:    &handler.Annotations{Q: q, Hub: hub},
		ScoutingNotes:  &handler.ScoutingNotes{Q: q},
		WS:             &handler.WS{Hub: hub, AllowedOrigins: cfg.AllowedOrigins},
		Uploads:        &handler.Uploads{Q: q, Worker: workers, BulkUploads: &handler.BulkUploads{Q: q}},
		RobotImages:    &handler.RobotImages{Q: q, Storage: store, BulkUploads: &handler.BulkUploads{Q: q}},
		Auth:           authHandler,
		AuthMiddleware: appmid.AuthDeps{Q: q, Signer: signer, DevBypass: cfg.AuthDevBypass},
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
