-- ScoutingNote rows: ydoc_state / plain_text は Hocuspocus が更新するため
-- Go API は CRUD と GET だけを公開する。
-- (tournament_id, team_id) ごとに最大1行。

-- name: CreateScoutingNote :one
INSERT INTO scouting_notes (tournament_id, team_id)
VALUES ($1, $2)
RETURNING *;

-- name: GetScoutingNote :one
SELECT * FROM scouting_notes WHERE id = $1;

-- name: GetScoutingNoteByTournamentAndTeam :one
SELECT * FROM scouting_notes
WHERE tournament_id = $1 AND team_id = $2;

-- name: ListScoutingNotesByTournament :many
SELECT * FROM scouting_notes
WHERE tournament_id = $1
ORDER BY created_at ASC, id ASC;

-- name: DeleteScoutingNote :execrows
DELETE FROM scouting_notes WHERE id = $1;
