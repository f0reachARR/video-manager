-- name: AddRunVideo :one
INSERT INTO run_videos (run_id, video_id, video_offset_start, video_offset_end, angle_label)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetRunVideo :one
SELECT * FROM run_videos WHERE id = $1;

-- name: ListRunVideosByRun :many
SELECT * FROM run_videos
WHERE run_id = $1
ORDER BY created_at ASC, id ASC;

-- name: UpdateRunVideo :one
UPDATE run_videos
SET
  video_offset_start = COALESCE(sqlc.narg('video_offset_start'), video_offset_start),
  video_offset_end = COALESCE(sqlc.narg('video_offset_end'), video_offset_end),
  angle_label = COALESCE(sqlc.narg('angle_label'), angle_label)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteRunVideo :execrows
DELETE FROM run_videos WHERE id = $1;

-- name: DeleteRunVideoByRunAndVideo :execrows
DELETE FROM run_videos WHERE run_id = $1 AND video_id = $2;
