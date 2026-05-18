-- name: CreateRun :one
INSERT INTO runs (session_id, team_id, robot_id, scenario_id, match_id, started_at, ended_at, score, memo)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: GetRun :one
SELECT * FROM runs WHERE id = $1;

-- name: ListRunsPage :many
SELECT *
FROM runs
WHERE
  (sqlc.narg('session_id')::uuid IS NULL OR session_id = sqlc.narg('session_id')::uuid)
  AND (sqlc.narg('team_id')::uuid IS NULL OR team_id = sqlc.narg('team_id')::uuid)
  AND (sqlc.narg('robot_id')::uuid IS NULL OR robot_id = sqlc.narg('robot_id')::uuid)
  AND (sqlc.narg('scenario_id')::uuid IS NULL OR scenario_id = sqlc.narg('scenario_id')::uuid)
  AND (sqlc.narg('match_id')::uuid IS NULL OR match_id = sqlc.narg('match_id')::uuid)
  AND (sqlc.narg('cursor_created_at')::timestamptz IS NULL OR (created_at, id) > (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY created_at ASC, id ASC
LIMIT $1;

-- name: UpdateRun :one
UPDATE runs
SET
  robot_id = COALESCE(sqlc.narg('robot_id')::uuid, robot_id),
  scenario_id = COALESCE(sqlc.narg('scenario_id')::uuid, scenario_id),
  match_id = CASE WHEN sqlc.arg('match_id_set')::bool THEN sqlc.narg('match_id')::uuid ELSE match_id END,
  started_at = COALESCE(sqlc.narg('started_at')::timestamptz, started_at),
  ended_at = COALESCE(sqlc.narg('ended_at')::timestamptz, ended_at),
  score = CASE WHEN sqlc.arg('score_set')::bool THEN sqlc.narg('score')::float8 ELSE score END,
  memo = COALESCE(sqlc.narg('memo'), memo)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteRun :execrows
DELETE FROM runs WHERE id = $1;
