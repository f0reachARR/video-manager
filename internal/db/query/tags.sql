-- name: CreateTag :one
INSERT INTO tags (name, color)
VALUES ($1, $2)
RETURNING *;

-- name: ListTags :many
SELECT * FROM tags ORDER BY name ASC;
