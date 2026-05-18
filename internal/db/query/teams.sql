-- name: CreateTeam :one
INSERT INTO teams (name, is_own)
VALUES ($1, $2)
RETURNING *;

-- name: ListTeams :many
SELECT * FROM teams ORDER BY is_own DESC, name ASC;

-- name: GetOwnTeam :one
SELECT * FROM teams WHERE is_own LIMIT 1;
