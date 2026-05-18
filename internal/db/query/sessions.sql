-- name: CreateSession :one
INSERT INTO sessions (name, started_at, ended_at, location, mode_hint, tournament_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetSession :one
SELECT * FROM sessions WHERE id = $1;

-- name: ListSessionsPage :many
SELECT *
FROM sessions
WHERE
  (sqlc.narg('mode_hint')::session_mode_hint IS NULL OR mode_hint = sqlc.narg('mode_hint')::session_mode_hint)
  AND (sqlc.narg('tournament_id')::uuid IS NULL OR tournament_id = sqlc.narg('tournament_id')::uuid)
  AND (sqlc.narg('started_from')::timestamptz IS NULL OR started_at >= sqlc.narg('started_from')::timestamptz)
  AND (sqlc.narg('started_to')::timestamptz IS NULL OR started_at <= sqlc.narg('started_to')::timestamptz)
  AND (sqlc.narg('cursor_created_at')::timestamptz IS NULL OR (created_at, id) > (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY created_at ASC, id ASC
LIMIT $1;

-- name: UpdateSession :one
UPDATE sessions
SET
  name = COALESCE(sqlc.narg('name'), name),
  started_at = CASE WHEN sqlc.arg('started_at_set')::bool THEN sqlc.narg('started_at') ELSE started_at END,
  ended_at = CASE WHEN sqlc.arg('ended_at_set')::bool THEN sqlc.narg('ended_at') ELSE ended_at END,
  location = CASE WHEN sqlc.arg('location_set')::bool THEN sqlc.narg('location') ELSE location END,
  mode_hint = COALESCE(sqlc.narg('mode_hint')::session_mode_hint, mode_hint),
  tournament_id = CASE WHEN sqlc.arg('tournament_id_set')::bool THEN sqlc.narg('tournament_id')::uuid ELSE tournament_id END
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteSession :execrows
DELETE FROM sessions WHERE id = $1;
