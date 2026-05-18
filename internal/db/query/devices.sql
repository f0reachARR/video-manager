-- name: CreateDevice :one
INSERT INTO devices (name, default_time_offset_sec)
VALUES ($1, $2)
RETURNING *;

-- name: ListDevices :many
SELECT * FROM devices ORDER BY created_at ASC;
