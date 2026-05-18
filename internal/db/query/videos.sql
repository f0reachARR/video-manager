-- name: CreateVideo :one
INSERT INTO videos (session_id, device_id, uploader_id, storage_key, recorded_at, duration_sec, time_offset_sec)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetVideo :one
SELECT * FROM videos WHERE id = $1;

-- name: GetVideoByStorageKey :one
SELECT * FROM videos WHERE storage_key = $1;

-- name: ListVideosPage :many
SELECT *
FROM videos
WHERE
  (sqlc.narg('session_id')::uuid IS NULL OR session_id = sqlc.narg('session_id')::uuid)
  AND (sqlc.narg('device_id')::uuid IS NULL OR device_id = sqlc.narg('device_id')::uuid)
  AND (sqlc.narg('unassigned')::bool IS NULL OR sqlc.narg('unassigned')::bool = false OR session_id IS NULL)
  AND (sqlc.narg('cursor_created_at')::timestamptz IS NULL OR (created_at, id) > (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY created_at ASC, id ASC
LIMIT $1;

-- name: UpdateVideo :one
UPDATE videos
SET
  session_id = CASE WHEN sqlc.arg('session_id_set')::bool THEN sqlc.narg('session_id')::uuid ELSE session_id END,
  device_id = CASE WHEN sqlc.arg('device_id_set')::bool THEN sqlc.narg('device_id')::uuid ELSE device_id END,
  recorded_at = CASE WHEN sqlc.arg('recorded_at_set')::bool THEN sqlc.narg('recorded_at')::timestamptz ELSE recorded_at END,
  time_offset_sec = COALESCE(sqlc.narg('time_offset_sec'), time_offset_sec)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: UpdateVideoProbe :one
UPDATE videos
SET
  recorded_at = CASE WHEN sqlc.arg('recorded_at_set')::bool THEN sqlc.narg('recorded_at')::timestamptz ELSE recorded_at END,
  duration_sec = CASE WHEN sqlc.arg('duration_sec_set')::bool THEN sqlc.narg('duration_sec')::int ELSE duration_sec END
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: UpdateVideoThumbnail :execrows
UPDATE videos
SET thumbnail_key = $2
WHERE id = $1;

-- name: DeleteVideo :execrows
DELETE FROM videos WHERE id = $1;
