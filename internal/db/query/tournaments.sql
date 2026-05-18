-- name: CreateTournament :one
INSERT INTO tournaments (name, start_date, end_date)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetTournament :one
SELECT * FROM tournaments WHERE id = $1;

-- name: ListTournamentsPage :many
SELECT *
FROM tournaments
WHERE (sqlc.narg('cursor_created_at')::timestamptz IS NULL
       OR (created_at, id) > (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY created_at ASC, id ASC
LIMIT $1;

-- name: UpdateTournament :one
UPDATE tournaments
SET
  name       = COALESCE(sqlc.narg('name'), name),
  start_date = CASE WHEN sqlc.arg('start_date_set')::bool THEN sqlc.narg('start_date')::date ELSE start_date END,
  end_date   = CASE WHEN sqlc.arg('end_date_set')::bool THEN sqlc.narg('end_date')::date ELSE end_date END
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteTournament :execrows
DELETE FROM tournaments WHERE id = $1;
