-- name: CreateAnnotation :one
INSERT INTO annotations (video_id, author_id, start_offset_sec, end_offset_sec, type, geometry, style, label)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetAnnotation :one
SELECT * FROM annotations WHERE id = $1;

-- name: ListAnnotationsByVideo :many
SELECT *
FROM annotations
WHERE video_id = $1
ORDER BY start_offset_sec ASC, id ASC;

-- name: UpdateAnnotation :one
UPDATE annotations
SET
  start_offset_sec = COALESCE(sqlc.narg('start_offset_sec')::float8, start_offset_sec),
  end_offset_sec   = COALESCE(sqlc.narg('end_offset_sec')::float8, end_offset_sec),
  geometry         = COALESCE(sqlc.narg('geometry')::jsonb, geometry),
  style            = COALESCE(sqlc.narg('style')::jsonb, style),
  label            = COALESCE(sqlc.narg('label'), label)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteAnnotation :execrows
DELETE FROM annotations WHERE id = $1;
