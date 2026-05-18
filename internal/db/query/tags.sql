-- name: CreateTag :one
INSERT INTO tags (name, color)
VALUES ($1, $2)
RETURNING *;

-- name: GetTag :one
SELECT * FROM tags WHERE id = $1;

-- name: ListTags :many
SELECT * FROM tags ORDER BY name ASC;

-- name: ListTagsPage :many
SELECT *
FROM tags
WHERE (sqlc.narg('cursor_created_at')::timestamptz IS NULL OR (created_at, id) > (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY created_at ASC, id ASC
LIMIT $1;

-- name: UpdateTag :one
UPDATE tags
SET
  name = COALESCE(sqlc.narg('name'), name),
  color = CASE WHEN sqlc.arg('color_set')::bool THEN sqlc.narg('color') ELSE color END
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteTag :execrows
DELETE FROM tags WHERE id = $1;
