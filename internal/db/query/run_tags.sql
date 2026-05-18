-- name: ListRunTagsByRun :many
SELECT tag_id FROM run_tags WHERE run_id = $1;

-- name: AddRunTag :exec
INSERT INTO run_tags (run_id, tag_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: ClearRunTags :exec
DELETE FROM run_tags WHERE run_id = $1;
