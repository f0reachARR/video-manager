-- name: CreateRobot :one
INSERT INTO robots (tournament_id, team_id, name, version)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetRobot :one
SELECT * FROM robots WHERE id = $1;

-- name: ListRobotsByTeam :many
SELECT * FROM robots
WHERE team_id = $1
  AND tournament_id = sqlc.arg('tournament_id')::uuid
ORDER BY name, version;

-- name: ListRobotsPage :many
SELECT *
FROM robots
WHERE
  tournament_id = sqlc.arg('tournament_id')::uuid
  AND (sqlc.narg('team_id')::uuid IS NULL OR team_id = sqlc.narg('team_id')::uuid)
  AND (sqlc.narg('cursor_created_at')::timestamptz IS NULL OR (created_at, id) > (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY created_at ASC, id ASC
LIMIT $1;

-- name: ListRobotsByTournament :many
SELECT * FROM robots
WHERE tournament_id = $1
ORDER BY name ASC, version ASC;

-- name: UpdateRobot :one
UPDATE robots
SET
  name = COALESCE(sqlc.narg('name'), name),
  version = COALESCE(sqlc.narg('version'), version)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteRobot :execrows
DELETE FROM robots WHERE id = $1;

-- name: DeleteRobotsOutsideTournamentTeams :execrows
-- Removes robots in this tournament whose team is no longer in tournament_teams.
-- Used after a Tournament's teams list shrinks so orphan robots don't linger.
DELETE FROM robots r
WHERE r.tournament_id = $1
  AND r.team_id NOT IN (
    SELECT tt.team_id FROM tournament_teams tt WHERE tt.tournament_id = $1
  );
