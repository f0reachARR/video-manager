-- name: CreateRobot :one
INSERT INTO robots (team_id, name, version)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListRobotsByTeam :many
SELECT * FROM robots WHERE team_id = $1 ORDER BY name, version;
