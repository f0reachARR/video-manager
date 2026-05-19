-- name: InsertRendition :one
INSERT INTO video_renditions (
  video_id, kind, passthrough, width, height, bandwidth_bps, playlist_key
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (video_id, kind) DO UPDATE
SET passthrough   = EXCLUDED.passthrough,
    width         = EXCLUDED.width,
    height        = EXCLUDED.height,
    bandwidth_bps = EXCLUDED.bandwidth_bps,
    playlist_key  = EXCLUDED.playlist_key,
    updated_at    = now()
RETURNING *;

-- name: GetRendition :one
SELECT * FROM video_renditions WHERE id = $1;

-- name: ListRenditionsByVideo :many
SELECT * FROM video_renditions
WHERE video_id = $1
ORDER BY kind ASC;

-- name: MarkRenditionEncoding :execrows
UPDATE video_renditions
SET status       = 'encoding',
    started_at   = COALESCE(started_at, now()),
    segments_done = 0,
    error        = NULL,
    updated_at   = now()
WHERE id = $1;

-- name: MarkRenditionReady :execrows
UPDATE video_renditions
SET status        = 'ready',
    completed_at  = now(),
    bandwidth_bps = COALESCE(sqlc.narg('bandwidth_bps')::int, bandwidth_bps),
    updated_at    = now()
WHERE id = sqlc.arg('id')::uuid;

-- name: MarkRenditionFailed :execrows
UPDATE video_renditions
SET status     = 'failed',
    error      = sqlc.arg('error')::text,
    updated_at = now()
WHERE id = sqlc.arg('id')::uuid;

-- name: IncrementRenditionSegments :execrows
UPDATE video_renditions
SET segments_done = segments_done + 1,
    updated_at    = now()
WHERE id = $1;

-- name: CountRenditionsByStatus :one
SELECT
  COUNT(*)                                       AS total,
  COUNT(*) FILTER (WHERE status = 'ready')       AS ready_count,
  COUNT(*) FILTER (WHERE status = 'failed')      AS failed_count
FROM video_renditions
WHERE video_id = $1;
