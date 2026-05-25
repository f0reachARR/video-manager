-- name: CreateVideo :one
INSERT INTO videos (tournament_id, session_id, device_id, uploader_id, storage_key, display_name, recorded_at, duration_sec, time_offset_sec)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: GetVideo :one
SELECT * FROM videos WHERE id = $1;

-- name: GetVideoByStorageKey :one
SELECT * FROM videos WHERE storage_key = $1;

-- name: ListVideosPage :many
SELECT *
FROM videos
WHERE
  tournament_id = sqlc.arg('tournament_id')::uuid
  AND (sqlc.narg('session_id')::uuid IS NULL OR session_id = sqlc.narg('session_id')::uuid)
  AND (sqlc.narg('device_id')::uuid IS NULL OR device_id = sqlc.narg('device_id')::uuid)
  AND (sqlc.narg('unassigned')::bool IS NULL OR sqlc.narg('unassigned')::bool = false OR session_id IS NULL)
  AND (sqlc.narg('cursor_created_at')::timestamptz IS NULL OR (created_at, id) > (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY created_at ASC, id ASC
LIMIT $1;

-- name: UpdateVideo :one
UPDATE videos
SET
  session_id = CASE WHEN sqlc.arg('session_id_set')::bool THEN sqlc.narg('session_id')::uuid ELSE session_id END,
  tournament_id = COALESCE(sqlc.narg('tournament_id')::uuid, tournament_id),
  device_id = CASE WHEN sqlc.arg('device_id_set')::bool THEN sqlc.narg('device_id')::uuid ELSE device_id END,
  recorded_at = CASE WHEN sqlc.arg('recorded_at_set')::bool THEN sqlc.narg('recorded_at')::timestamptz ELSE recorded_at END,
  time_offset_sec = COALESCE(sqlc.narg('time_offset_sec'), time_offset_sec),
  display_name = COALESCE(sqlc.narg('display_name'), display_name)
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

-- name: UpdateVideoSource :execrows
UPDATE videos
SET
  source_video_codec = sqlc.narg('source_video_codec')::text,
  source_audio_codec = sqlc.narg('source_audio_codec')::text,
  source_width       = sqlc.narg('source_width')::int,
  source_height      = sqlc.narg('source_height')::int,
  passthrough_ok     = sqlc.arg('passthrough_ok')::bool
WHERE id = sqlc.arg('id')::uuid;

-- name: UpdateVideoHLSStatus :execrows
UPDATE videos
SET hls_status = sqlc.arg('hls_status')::hls_status
WHERE id = sqlc.arg('id')::uuid;

-- name: UpdateVideoHLSReady :execrows
UPDATE videos
SET hls_status = 'ready', hls_master_key = sqlc.arg('hls_master_key')::text
WHERE id = sqlc.arg('id')::uuid;

-- name: DeleteVideo :execrows
DELETE FROM videos WHERE id = $1;
