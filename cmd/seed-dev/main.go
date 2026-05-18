// seed-dev populates the database with minimal master data so that
// the development UI has something to show. Idempotent: skips rows whose
// natural keys already exist.
package main

import (
	"context"
	"errors"
	"log/slog"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/f0reachARR/video-manager/internal/config"
	"github.com/f0reachARR/video-manager/internal/db"
	"github.com/f0reachARR/video-manager/internal/db/sqlc"
)

func main() {
	if err := run(); err != nil {
		slog.Error("seed-dev failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx := context.Background()
	database, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer database.Close()

	q := sqlc.New(database.Pool)

	user, err := ensureUser(ctx, q, "Default User", strPtr("#3b82f6"))
	if err != nil {
		return err
	}
	slog.Info("user", "id", uuidStr(user.ID), "name", user.Name)

	ownTeam, err := ensureOwnTeam(ctx, q, "Our Team")
	if err != nil {
		return err
	}
	slog.Info("team", "id", uuidStr(ownTeam.ID), "name", ownTeam.Name, "isOwn", ownTeam.IsOwn)

	device, err := ensureDevice(ctx, q, "iPhone (default)", 0)
	if err != nil {
		return err
	}
	slog.Info("device", "id", uuidStr(device.ID), "name", device.Name)

	robot, err := ensureRobot(ctx, q, ownTeam.ID, "Main Robot", "v1")
	if err != nil {
		return err
	}
	slog.Info("robot", "id", uuidStr(robot.ID), "name", robot.Name, "version", robot.Version)

	scenario, err := ensureScenario(ctx, q, "Default Scenario", "本走のフル走行")
	if err != nil {
		return err
	}
	slog.Info("scenario", "id", uuidStr(scenario.ID), "name", scenario.Name)

	tag, err := ensureTag(ctx, q, "important", strPtr("#ef4444"))
	if err != nil {
		return err
	}
	slog.Info("tag", "id", uuidStr(tag.ID), "name", tag.Name)

	return nil
}

func strPtr(s string) *string { return &s }

func uuidStr(id pgtype.UUID) string {
	if !id.Valid {
		return ""
	}
	s, err := id.Value()
	if err != nil {
		return ""
	}
	if v, ok := s.(string); ok {
		return v
	}
	return ""
}

func ensureUser(ctx context.Context, q *sqlc.Queries, name string, color *string) (sqlc.User, error) {
	users, err := q.ListUsers(ctx)
	if err != nil {
		return sqlc.User{}, err
	}
	for _, u := range users {
		if u.Name == name {
			return u, nil
		}
	}
	return q.CreateUser(ctx, sqlc.CreateUserParams{Name: name, Color: color})
}

func ensureOwnTeam(ctx context.Context, q *sqlc.Queries, name string) (sqlc.Team, error) {
	team, err := q.GetOwnTeam(ctx)
	if err == nil {
		return team, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return sqlc.Team{}, err
	}
	return q.CreateTeam(ctx, sqlc.CreateTeamParams{Name: name, IsOwn: true})
}

func ensureDevice(ctx context.Context, q *sqlc.Queries, name string, offset int32) (sqlc.Device, error) {
	devices, err := q.ListDevices(ctx)
	if err != nil {
		return sqlc.Device{}, err
	}
	for _, d := range devices {
		if d.Name == name {
			return d, nil
		}
	}
	return q.CreateDevice(ctx, sqlc.CreateDeviceParams{Name: name, DefaultTimeOffsetSec: offset})
}

func ensureRobot(ctx context.Context, q *sqlc.Queries, teamID pgtype.UUID, name, version string) (sqlc.Robot, error) {
	robots, err := q.ListRobotsByTeam(ctx, teamID)
	if err != nil {
		return sqlc.Robot{}, err
	}
	for _, r := range robots {
		if r.Name == name && r.Version == version {
			return r, nil
		}
	}
	return q.CreateRobot(ctx, sqlc.CreateRobotParams{
		TeamID:  teamID,
		Name:    name,
		Version: version,
	})
}

func ensureScenario(ctx context.Context, q *sqlc.Queries, name, description string) (sqlc.Scenario, error) {
	scenarios, err := q.ListScenarios(ctx)
	if err != nil {
		return sqlc.Scenario{}, err
	}
	for _, s := range scenarios {
		if s.Name == name {
			return s, nil
		}
	}
	return q.CreateScenario(ctx, sqlc.CreateScenarioParams{Name: name, Description: description})
}

func ensureTag(ctx context.Context, q *sqlc.Queries, name string, color *string) (sqlc.Tag, error) {
	tags, err := q.ListTags(ctx)
	if err != nil {
		return sqlc.Tag{}, err
	}
	for _, t := range tags {
		if t.Name == name {
			return t, nil
		}
	}
	return q.CreateTag(ctx, sqlc.CreateTagParams{Name: name, Color: color})
}
