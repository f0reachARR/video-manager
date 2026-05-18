-- name: CreateScenario :one
INSERT INTO scenarios (name, description)
VALUES ($1, $2)
RETURNING *;

-- name: GetScenario :one
SELECT * FROM scenarios WHERE id = $1;

-- name: ListScenarios :many
SELECT * FROM scenarios ORDER BY name ASC;

-- name: ListScenariosPage :many
SELECT *
FROM scenarios
WHERE (sqlc.narg('cursor_created_at')::timestamptz IS NULL OR (created_at, id) > (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::uuid))
ORDER BY created_at ASC, id ASC
LIMIT $1;

-- name: UpdateScenario :one
UPDATE scenarios
SET
  name = COALESCE(sqlc.narg('name'), name),
  description = COALESCE(sqlc.narg('description'), description)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteScenario :execrows
DELETE FROM scenarios WHERE id = $1;
