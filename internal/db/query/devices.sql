-- name: CreateDevice :one
INSERT INTO devices (name, default_time_offset_sec)
VALUES ($1, $2)
RETURNING *;

-- name: GetDevice :one
SELECT * FROM devices WHERE id = $1;

-- name: ListDevices :many
SELECT * FROM devices ORDER BY created_at ASC;

-- name: ListDevicesPage :many
SELECT *
FROM devices
WHERE (sqlc.narg('cursor_created_at')::timestamptz IS NULL OR (created_at, id) > (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY created_at ASC, id ASC
LIMIT $1;

-- name: UpdateDevice :one
UPDATE devices
SET
  name = COALESCE(sqlc.narg('name'), name),
  default_time_offset_sec = COALESCE(sqlc.narg('default_time_offset_sec'), default_time_offset_sec)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteDevice :execrows
DELETE FROM devices WHERE id = $1;
