-- name: CreateRobot :one
INSERT INTO robots (team_id, name, version)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetRobot :one
SELECT * FROM robots WHERE id = $1;

-- name: ListRobotsByTeam :many
SELECT * FROM robots WHERE team_id = $1 ORDER BY name, version;

-- name: ListRobotsPage :many
SELECT *
FROM robots
WHERE
  (sqlc.narg('team_id')::uuid IS NULL OR team_id = sqlc.narg('team_id')::uuid)
  AND (sqlc.narg('cursor_created_at')::timestamptz IS NULL OR (created_at, id) > (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY created_at ASC, id ASC
LIMIT $1;

-- name: UpdateRobot :one
UPDATE robots
SET
  name = COALESCE(sqlc.narg('name'), name),
  version = COALESCE(sqlc.narg('version'), version)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteRobot :execrows
DELETE FROM robots WHERE id = $1;
