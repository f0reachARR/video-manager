-- name: CreateMatch :one
INSERT INTO matches (tournament_id, team_a_id, team_b_id, scheduled_at)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetMatch :one
SELECT * FROM matches WHERE id = $1;

-- name: ListMatchesPage :many
SELECT *
FROM matches
WHERE
  tournament_id = sqlc.arg('tournament_id')::uuid
  AND (sqlc.narg('cursor_created_at')::timestamptz IS NULL
       OR (created_at, id) > (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY created_at ASC, id ASC
LIMIT $1;

-- name: UpdateMatch :one
UPDATE matches
SET
  team_a_id    = COALESCE(sqlc.narg('team_a_id')::uuid, team_a_id),
  team_b_id    = COALESCE(sqlc.narg('team_b_id')::uuid, team_b_id),
  scheduled_at = CASE WHEN sqlc.arg('scheduled_at_set')::bool THEN sqlc.narg('scheduled_at')::timestamptz ELSE scheduled_at END
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteMatch :execrows
DELETE FROM matches WHERE id = $1;
