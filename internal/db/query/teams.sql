-- name: CreateTeam :one
INSERT INTO teams (name, is_own)
VALUES ($1, $2)
RETURNING *;

-- name: GetTeam :one
SELECT * FROM teams WHERE id = $1;

-- name: ListTeams :many
SELECT * FROM teams ORDER BY is_own DESC, name ASC;

-- name: ListTeamsPage :many
SELECT *
FROM teams
WHERE (sqlc.narg('cursor_created_at')::timestamptz IS NULL OR (created_at, id) > (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY created_at ASC, id ASC
LIMIT $1;

-- name: GetOwnTeam :one
SELECT * FROM teams WHERE is_own LIMIT 1;

-- name: UpdateTeam :one
UPDATE teams
SET
  name = COALESCE(sqlc.narg('name'), name),
  is_own = COALESCE(sqlc.narg('is_own'), is_own)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteTeam :execrows
DELETE FROM teams WHERE id = $1;
