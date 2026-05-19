-- name: CreateRun :one
INSERT INTO runs (session_id, team_id, robot_id, scenario_id, match_id, started_at, ended_at, score, memo, duration_sec)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetRun :one
SELECT * FROM runs WHERE id = $1;

-- name: ListRunsPage :many
SELECT *
FROM runs
WHERE
  (sqlc.narg('session_id')::uuid IS NULL OR session_id = sqlc.narg('session_id')::uuid)
  AND (sqlc.narg('team_id')::uuid IS NULL OR team_id = sqlc.narg('team_id')::uuid)
  AND (sqlc.narg('robot_id')::uuid IS NULL OR robot_id = sqlc.narg('robot_id')::uuid)
  AND (sqlc.narg('scenario_id')::uuid IS NULL OR scenario_id = sqlc.narg('scenario_id')::uuid)
  AND (sqlc.narg('match_id')::uuid IS NULL OR match_id = sqlc.narg('match_id')::uuid)
  AND (sqlc.narg('cursor_created_at')::timestamptz IS NULL OR (created_at, id) > (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY created_at ASC, id ASC
LIMIT $1;

-- name: UpdateRun :one
UPDATE runs
SET
  robot_id = COALESCE(sqlc.narg('robot_id')::uuid, robot_id),
  scenario_id = COALESCE(sqlc.narg('scenario_id')::uuid, scenario_id),
  match_id = CASE WHEN sqlc.arg('match_id_set')::bool THEN sqlc.narg('match_id')::uuid ELSE match_id END,
  started_at = COALESCE(sqlc.narg('started_at')::timestamptz, started_at),
  ended_at = COALESCE(sqlc.narg('ended_at')::timestamptz, ended_at),
  score = CASE WHEN sqlc.arg('score_set')::bool THEN sqlc.narg('score')::float8 ELSE score END,
  memo = COALESCE(sqlc.narg('memo'), memo),
  duration_sec = COALESCE(sqlc.narg('duration_sec')::int, duration_sec)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteRun :execrows
DELETE FROM runs WHERE id = $1;

-- Videos uploaded against the Run's session that are not yet attached to it.
-- Used to populate the "Run に追加すべき動画" recommendation list.
-- name: ListRecommendedVideosForRun :many
SELECT v.*
FROM videos v
JOIN runs r ON r.id = $1
WHERE v.session_id = r.session_id
  AND NOT EXISTS (
    SELECT 1 FROM run_videos rv
    WHERE rv.run_id = r.id AND rv.video_id = v.id
  )
ORDER BY v.created_at DESC, v.id DESC
LIMIT 50;

-- name: SearchRuns :many
SELECT r.*
FROM runs r
WHERE
  (sqlc.narg('from')::timestamptz IS NULL OR r.started_at >= sqlc.narg('from')::timestamptz)
  AND (sqlc.narg('to')::timestamptz IS NULL OR r.started_at < sqlc.narg('to')::timestamptz)
  AND (sqlc.narg('robot_id')::uuid IS NULL OR r.robot_id = sqlc.narg('robot_id')::uuid)
  AND (sqlc.narg('scenario_id')::uuid IS NULL OR r.scenario_id = sqlc.narg('scenario_id')::uuid)
  AND (sqlc.narg('memo_q')::text IS NULL OR r.memo ILIKE '%' || sqlc.narg('memo_q')::text || '%')
  AND (COALESCE(array_length(sqlc.narg('marker_categories')::text[], 1), 0) = 0
       OR EXISTS (
         SELECT 1 FROM markers m
         WHERE m.run_id = r.id
           AND m.category::text = ANY(sqlc.narg('marker_categories')::text[])
       ))
  AND (sqlc.arg('tag_count')::int = 0 OR (
         SELECT count(DISTINCT tag_id) FROM run_tags
         WHERE run_id = r.id
           AND tag_id = ANY(sqlc.narg('tag_ids')::uuid[])
       ) = sqlc.arg('tag_count')::int)
  AND (sqlc.narg('cursor_started_at')::timestamptz IS NULL
       OR (r.started_at, r.id) < (sqlc.narg('cursor_started_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY r.started_at DESC, r.id DESC
LIMIT $1;
