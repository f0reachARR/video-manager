package route

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/f0reachARR/video-manager/internal/http/handler"
)

type Deps struct {
	Health         *handler.Health
	Users          *handler.Users
	Devices        *handler.Devices
	Teams          *handler.Teams
	Robots         *handler.Robots
	Scenarios      *handler.Scenarios
	Tags           *handler.Tags
	Sessions       *handler.Sessions
	Videos         *handler.Videos
	Runs           *handler.Runs
	Markers        *handler.Markers
	Tournaments    *handler.Tournaments
	Matches        *handler.Matches
	Uploads        *handler.Uploads
	AllowedOrigins []string
}

func New(d Deps) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	if len(d.AllowedOrigins) > 0 {
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins:   d.AllowedOrigins,
			AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
			AllowedHeaders:   []string{"Content-Type", "Authorization", "X-User-Id"},
			AllowCredentials: true,
			MaxAge:           300,
		}))
	}

	r.Get("/health", d.Health.Live)
	r.Get("/ready", d.Health.Ready)

	r.Route("/users", func(r chi.Router) {
		r.Get("/", d.Users.List)
		r.Post("/", d.Users.Create)
		r.Get("/{userId}", d.Users.Get)
		r.Patch("/{userId}", d.Users.Update)
		r.Delete("/{userId}", d.Users.Delete)
	})

	r.Route("/devices", func(r chi.Router) {
		r.Get("/", d.Devices.List)
		r.Post("/", d.Devices.Create)
		r.Get("/{deviceId}", d.Devices.Get)
		r.Patch("/{deviceId}", d.Devices.Update)
		r.Delete("/{deviceId}", d.Devices.Delete)
	})

	r.Route("/teams", func(r chi.Router) {
		r.Get("/", d.Teams.List)
		r.Post("/", d.Teams.Create)
		r.Get("/{teamId}", d.Teams.Get)
		r.Patch("/{teamId}", d.Teams.Update)
		r.Delete("/{teamId}", d.Teams.Delete)
		r.Get("/{teamId}/marker-stats", d.Teams.MarkerStats)
	})

	r.Route("/robots", func(r chi.Router) {
		r.Get("/", d.Robots.List)
		r.Post("/", d.Robots.Create)
		r.Get("/{robotId}", d.Robots.Get)
		r.Patch("/{robotId}", d.Robots.Update)
		r.Delete("/{robotId}", d.Robots.Delete)
	})

	r.Route("/scenarios", func(r chi.Router) {
		r.Get("/", d.Scenarios.List)
		r.Post("/", d.Scenarios.Create)
		r.Get("/{scenarioId}", d.Scenarios.Get)
		r.Patch("/{scenarioId}", d.Scenarios.Update)
		r.Delete("/{scenarioId}", d.Scenarios.Delete)
	})

	r.Route("/tags", func(r chi.Router) {
		r.Get("/", d.Tags.List)
		r.Post("/", d.Tags.Create)
		r.Get("/{tagId}", d.Tags.Get)
		r.Patch("/{tagId}", d.Tags.Update)
		r.Delete("/{tagId}", d.Tags.Delete)
	})

	r.Route("/sessions", func(r chi.Router) {
		r.Get("/", d.Sessions.List)
		r.Post("/", d.Sessions.Create)
		r.Get("/candidates", d.Sessions.Candidates)
		r.Get("/{sessionId}", d.Sessions.Get)
		r.Patch("/{sessionId}", d.Sessions.Update)
		r.Delete("/{sessionId}", d.Sessions.Delete)
	})

	r.Route("/videos", func(r chi.Router) {
		r.Get("/", d.Videos.List)
		r.Get("/{videoId}", d.Videos.Get)
		r.Patch("/{videoId}", d.Videos.Update)
		r.Delete("/{videoId}", d.Videos.Delete)
		r.Get("/{videoId}/playback-url", d.Videos.PlaybackURL)
		r.Get("/{videoId}/thumbnail-url", d.Videos.ThumbnailURL)
	})

	r.Route("/runs", func(r chi.Router) {
		r.Get("/", d.Runs.List)
		r.Post("/", d.Runs.Create)
		r.Get("/{runId}", d.Runs.Get)
		r.Patch("/{runId}", d.Runs.Update)
		r.Delete("/{runId}", d.Runs.Delete)
		r.Post("/{runId}/videos", d.Runs.AddVideo)
		r.Patch("/{runId}/videos/{runVideoId}", d.Runs.UpdateVideo)
		r.Delete("/{runId}/videos/{runVideoId}", d.Runs.RemoveVideo)
		r.Get("/{runId}/markers", d.Markers.List)
		r.Post("/{runId}/markers", d.Markers.Create)
	})

	r.Get("/search/runs", d.Runs.Search)

	r.Route("/tournaments", func(r chi.Router) {
		r.Get("/", d.Tournaments.List)
		r.Post("/", d.Tournaments.Create)
		r.Get("/{tournamentId}", d.Tournaments.Get)
		r.Patch("/{tournamentId}", d.Tournaments.Update)
		r.Delete("/{tournamentId}", d.Tournaments.Delete)
	})

	r.Route("/matches", func(r chi.Router) {
		r.Get("/", d.Matches.List)
		r.Post("/", d.Matches.Create)
		r.Get("/{matchId}", d.Matches.Get)
		r.Patch("/{matchId}", d.Matches.Update)
		r.Delete("/{matchId}", d.Matches.Delete)
	})

	r.Route("/markers", func(r chi.Router) {
		r.Patch("/{markerId}", d.Markers.Update)
		r.Delete("/{markerId}", d.Markers.Delete)
	})

	r.Post("/uploads/tus-hook", d.Uploads.TusHook)

	return r
}
