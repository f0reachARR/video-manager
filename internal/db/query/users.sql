-- name: CreateUser :one
INSERT INTO users (name, color)
VALUES ($1, $2)
RETURNING *;

-- name: GetUser :one
SELECT * FROM users WHERE id = $1;

-- name: ListUsers :many
SELECT * FROM users ORDER BY created_at ASC;

-- name: ListUsersPage :many
SELECT *
FROM users
WHERE (sqlc.narg('cursor_created_at')::timestamptz IS NULL OR (created_at, id) > (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY created_at ASC, id ASC
LIMIT $1;

-- name: UpdateUser :one
UPDATE users
SET
  name = COALESCE(sqlc.narg('name'), name),
  color = CASE WHEN sqlc.arg('color_set')::bool THEN sqlc.narg('color') ELSE color END
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteUser :execrows
DELETE FROM users WHERE id = $1;

-- name: GetUserByOIDCSub :one
SELECT * FROM users WHERE oidc_sub = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE lower(email) = lower($1::text);

-- name: LinkUserOIDC :one
UPDATE users
SET oidc_sub = sqlc.arg('oidc_sub')::text,
    email    = COALESCE(sqlc.narg('email')::text, email),
    name     = COALESCE(sqlc.narg('name')::text, name)
WHERE id = sqlc.arg('id')::uuid
RETURNING *;

-- name: CreateUserFromOIDC :one
INSERT INTO users (name, oidc_sub, email)
VALUES ($1, $2, $3)
RETURNING *;
