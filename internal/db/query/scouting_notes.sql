-- ScoutingNote rows: ydoc_state / plain_text は Hocuspocus が更新するため
-- Go API は CRUD と GET だけを公開する。

-- name: CreateScoutingNote :one
INSERT INTO scouting_notes (match_id, target_team_id)
VALUES ($1, $2)
RETURNING *;

-- name: GetScoutingNote :one
SELECT * FROM scouting_notes WHERE id = $1;

-- name: GetScoutingNoteByMatchAndTeam :one
SELECT * FROM scouting_notes
WHERE match_id = $1 AND target_team_id = $2;

-- name: ListScoutingNotesByMatch :many
SELECT * FROM scouting_notes
WHERE match_id = $1
ORDER BY created_at ASC, id ASC;

-- name: DeleteScoutingNote :execrows
DELETE FROM scouting_notes WHERE id = $1;
