-- name: CreateScenario :one
INSERT INTO scenarios (name, description)
VALUES ($1, $2)
RETURNING *;

-- name: ListScenarios :many
SELECT * FROM scenarios ORDER BY name ASC;
