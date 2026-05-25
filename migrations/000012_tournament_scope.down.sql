-- down は形だけ用意。データは戻らない。

-- scouting_notes
DELETE FROM scouting_notes;

DROP INDEX IF EXISTS idx_scouting_notes_tournament;
DROP INDEX IF EXISTS idx_scouting_notes_team;

ALTER TABLE scouting_notes
    DROP CONSTRAINT IF EXISTS scouting_notes_tournament_team_unique;

ALTER TABLE scouting_notes
    DROP COLUMN tournament_id,
    DROP COLUMN team_id,
    ADD COLUMN match_id       uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    ADD COLUMN target_team_id uuid NOT NULL REFERENCES teams(id)   ON DELETE CASCADE;

ALTER TABLE scouting_notes
    ADD CONSTRAINT scouting_notes_match_id_target_team_id_key UNIQUE (match_id, target_team_id);

CREATE INDEX idx_scouting_notes_match ON scouting_notes(match_id);
CREATE INDEX idx_scouting_notes_team  ON scouting_notes(target_team_id);

-- runs
DROP INDEX IF EXISTS idx_runs_tournament_id;
ALTER TABLE runs DROP COLUMN tournament_id;

-- videos
DROP INDEX IF EXISTS idx_videos_tournament_id;
ALTER TABLE videos
    DROP COLUMN tournament_id;

-- sessions
ALTER TABLE sessions
    DROP CONSTRAINT sessions_tournament_id_fkey;

ALTER TABLE sessions
    ADD CONSTRAINT sessions_tournament_id_fkey
        FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL;

ALTER TABLE sessions
    ALTER COLUMN tournament_id DROP NOT NULL;
