-- name: CreateMarker :one
INSERT INTO markers (run_id, author_id, run_offset_sec, label, category)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetMarker :one
SELECT * FROM markers WHERE id = $1;

-- name: ListMarkersByRun :many
SELECT *
FROM markers
WHERE run_id = sqlc.arg('run_id')
  AND (sqlc.narg('cursor_run_offset')::int IS NULL
       OR (run_offset_sec, id) > (sqlc.narg('cursor_run_offset')::int, sqlc.narg('cursor_id')::uuid))
  AND (COALESCE(array_length(sqlc.narg('categories')::text[], 1), 0) = 0
       OR category::text = ANY(sqlc.narg('categories')::text[]))
ORDER BY run_offset_sec ASC, id ASC
LIMIT $1;

-- name: UpdateMarker :one
UPDATE markers
SET
  run_offset_sec = COALESCE(sqlc.narg('run_offset_sec'), run_offset_sec),
  label          = COALESCE(sqlc.narg('label'), label),
  category       = COALESCE(sqlc.narg('category'), category)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteMarker :execrows
DELETE FROM markers WHERE id = $1;

-- name: CountMarkersByTeamAndCategory :many
SELECT m.category, COUNT(*) AS count
FROM markers m
JOIN runs r ON r.id = m.run_id
WHERE r.team_id = $1
GROUP BY m.category;
