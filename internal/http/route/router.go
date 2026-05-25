package route

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimid "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/f0reachARR/video-manager/internal/http/handler"
	appmid "github.com/f0reachARR/video-manager/internal/http/middleware"
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
	BulkUploads    *handler.BulkUploads
	Matches        *handler.Matches
	Annotations    *handler.Annotations
	ScoutingNotes  *handler.ScoutingNotes
	WS             *handler.WS
	Uploads        *handler.Uploads
	Auth           *handler.Auth
	RobotImages    *handler.RobotImages
	WorkerInternal *handler.WorkerInternal
	WorkerToken    string
	AuthMiddleware appmid.AuthDeps
	AllowedOrigins []string
}

func New(d Deps) http.Handler {
	r := chi.NewRouter()

	r.Use(chimid.RequestID)
	r.Use(chimid.RealIP)
	r.Use(chimid.Logger)
	r.Use(chimid.Recoverer)

	if len(d.AllowedOrigins) > 0 {
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins:   d.AllowedOrigins,
			AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
			AllowedHeaders:   []string{"Content-Type", "Authorization", "X-User-Id"},
			AllowCredentials: true,
			MaxAge:           300,
		}))
	}

	// Resolve the authenticated user from the session cookie (or X-User-Id
	// when dev-bypass is enabled). Runs before every route — handlers that
	// need auth call auth.UserFromContext themselves.
	r.Use(appmid.LoadUser(d.AuthMiddleware))

	r.Get("/health", d.Health.Live)
	r.Get("/ready", d.Health.Ready)

	if d.Auth != nil {
		r.Route("/auth", func(r chi.Router) {
			r.Get("/config", d.Auth.Config)
			r.Get("/login", d.Auth.Login)
			r.Get("/callback", d.Auth.Callback)
			r.Post("/logout", d.Auth.Logout)
			r.Get("/me", d.Auth.Me)
		})
	}

	r.Post("/uploads/tus-hook", d.Uploads.TusHook)

	if d.WorkerInternal != nil {
		r.Route("/internal/worker", func(r chi.Router) {
			r.Use(appmid.WorkerAuth(d.WorkerToken))
			r.Post("/jobs/claim", d.WorkerInternal.Claim)
			r.Post("/jobs/{jobId}/heartbeat", d.WorkerInternal.Heartbeat)
			r.Post("/jobs/{jobId}/progress", d.WorkerInternal.Progress)
			r.Post("/jobs/{jobId}/complete", d.WorkerInternal.Complete)
			r.Post("/jobs/{jobId}/fail", d.WorkerInternal.Fail)
		})
	}

	r.Group(func(r chi.Router) {
		r.Use(appmid.RequireAuth())
		mountAuthedRoutes(r, d)
	})

	return r
}

func mountAuthedRoutes(r chi.Router, d Deps) {
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
		if d.RobotImages != nil {
			r.Get("/{robotId}/images", d.RobotImages.List)
			r.Post("/{robotId}/images", d.RobotImages.Upload)
			r.Put("/{robotId}/primary-image", d.RobotImages.SetPrimary)
		}
	})

	if d.RobotImages != nil {
		r.Route("/robot-images", func(r chi.Router) {
			r.Patch("/{imageId}", d.RobotImages.Update)
			r.Delete("/{imageId}", d.RobotImages.Delete)
			r.Get("/{imageId}/raw", d.RobotImages.Raw)
			r.Get("/{imageId}/thumb", d.RobotImages.Thumb)
		})
	}

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
		r.Get("/{videoId}/renditions", d.Videos.Renditions)
		r.Get("/{videoId}/hls/*", d.Videos.HLSProxy)
		r.Get("/{videoId}/annotations", d.Annotations.List)
		r.Post("/{videoId}/annotations", d.Annotations.Create)
	})

	r.Get("/encoding-jobs", d.Videos.EncodingJobs)

	r.Route("/runs", func(r chi.Router) {
		r.Get("/", d.Runs.List)
		r.Post("/", d.Runs.Create)
		r.Get("/{runId}", d.Runs.Get)
		r.Patch("/{runId}", d.Runs.Update)
		r.Delete("/{runId}", d.Runs.Delete)
		r.Post("/{runId}/videos", d.Runs.AddVideo)
		r.Patch("/{runId}/videos/{runVideoId}", d.Runs.UpdateVideo)
		r.Delete("/{runId}/videos/{runVideoId}", d.Runs.RemoveVideo)
		r.Get("/{runId}/recommended-videos", d.Runs.RecommendedVideos)
		r.Get("/{runId}/markers", d.Markers.List)
		r.Post("/{runId}/markers", d.Markers.Create)
		if d.RobotImages != nil {
			r.Get("/{runId}/robot-images", d.RobotImages.ListForRun)
		}
	})

	r.Get("/search/runs", d.Runs.Search)

	r.Route("/tournaments", func(r chi.Router) {
		r.Get("/", d.Tournaments.List)
		r.Post("/", d.Tournaments.Create)
		r.Get("/{tournamentId}", d.Tournaments.Get)
		r.Patch("/{tournamentId}", d.Tournaments.Update)
		r.Delete("/{tournamentId}", d.Tournaments.Delete)
		r.Get("/{tournamentId}/teams", d.Tournaments.ListTeams)
		r.Put("/{tournamentId}/teams", d.Tournaments.ReplaceTeams)
		r.Get("/{tournamentId}/robots", d.Tournaments.ListRobots)
		if d.BulkUploads != nil {
			r.Post("/{tournamentId}/bulk-uploads/check", d.BulkUploads.Check)
			r.Delete("/{tournamentId}/bulk-uploads/fingerprints", d.BulkUploads.ClearFingerprints)
		}
		r.Get("/{tournamentId}/scouting-notes", d.ScoutingNotes.ListByTournament)
		r.Get("/{tournamentId}/teams/{teamId}/scouting-note", d.ScoutingNotes.GetByTeam)
	})

	r.Route("/matches", func(r chi.Router) {
		r.Get("/", d.Matches.List)
		r.Post("/", d.Matches.Create)
		r.Get("/{matchId}", d.Matches.Get)
		r.Patch("/{matchId}", d.Matches.Update)
		r.Delete("/{matchId}", d.Matches.Delete)
	})

	r.Route("/scouting-notes", func(r chi.Router) {
		r.Get("/{noteId}", d.ScoutingNotes.Get)
		r.Delete("/{noteId}", d.ScoutingNotes.Delete)
	})

	r.Route("/markers", func(r chi.Router) {
		r.Get("/{markerId}", d.Markers.Get)
		r.Patch("/{markerId}", d.Markers.Update)
		r.Delete("/{markerId}", d.Markers.Delete)
	})

	r.Route("/annotations", func(r chi.Router) {
		r.Patch("/{annotationId}", d.Annotations.Update)
		r.Delete("/{annotationId}", d.Annotations.Delete)
	})

	if d.WS != nil {
		r.Get("/ws/run/{runId}", d.WS.SubscribeRun)
		r.Get("/ws/video/{videoId}", d.WS.SubscribeVideo)
	}
}
