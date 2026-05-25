-- 大会を中心に据えたデータモデル再編。
-- - sessions.tournament_id を NOT NULL 化（ON DELETE CASCADE 化）
-- - videos / runs に tournament_id を直接持たせる（session 経由のフィルタを排除）
-- - scouting_notes を (tournament_id, team_id) ごとに1つに作り直す
-- 既存データは dev 前提で破壊的に切り捨てる。

-- Sessions: tournament_id NULL のセッションを破棄（FK CASCADE で runs / videos / scouting_notes 等が連鎖削除）
DELETE FROM sessions WHERE tournament_id IS NULL;

ALTER TABLE sessions
    ALTER COLUMN tournament_id SET NOT NULL;

ALTER TABLE sessions
    DROP CONSTRAINT sessions_tournament_id_fkey;

ALTER TABLE sessions
    ADD CONSTRAINT sessions_tournament_id_fkey
        FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;

-- Videos: tournament_id を直接持たせる。session_id は引き続き NULL 可
-- (バルクアップロード時に session 未確定のまま動画行を作る運用を残す)。
-- session_id NULL の既存動画は backfill できないので削除する (dev 前提)。
DELETE FROM videos WHERE session_id IS NULL;

ALTER TABLE videos
    ADD COLUMN tournament_id uuid REFERENCES tournaments(id) ON DELETE CASCADE;

UPDATE videos v
    SET tournament_id = s.tournament_id
    FROM sessions s
    WHERE v.session_id = s.id;

ALTER TABLE videos
    ALTER COLUMN tournament_id SET NOT NULL;

CREATE INDEX idx_videos_tournament_id ON videos(tournament_id);

-- Runs: session_id は既に NOT NULL なので素直に backfill。
ALTER TABLE runs
    ADD COLUMN tournament_id uuid REFERENCES tournaments(id) ON DELETE CASCADE;

UPDATE runs r
    SET tournament_id = s.tournament_id
    FROM sessions s
    WHERE r.session_id = s.id;

ALTER TABLE runs
    ALTER COLUMN tournament_id SET NOT NULL;

CREATE INDEX idx_runs_tournament_id ON runs(tournament_id);

-- Scouting notes: (match, target_team) から (tournament, team) に作り直す。
-- match 単位の note を tournament 単位に丸める意味のあるマッピングが無いため、データは破棄する。
DELETE FROM scouting_notes;

DROP INDEX IF EXISTS idx_scouting_notes_match;
DROP INDEX IF EXISTS idx_scouting_notes_team;

ALTER TABLE scouting_notes
    DROP CONSTRAINT scouting_notes_match_id_target_team_id_key;

ALTER TABLE scouting_notes
    DROP COLUMN match_id,
    DROP COLUMN target_team_id,
    ADD COLUMN tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    ADD COLUMN team_id        uuid NOT NULL REFERENCES teams(id)       ON DELETE CASCADE;

ALTER TABLE scouting_notes
    ADD CONSTRAINT scouting_notes_tournament_team_unique UNIQUE (tournament_id, team_id);

CREATE INDEX idx_scouting_notes_tournament ON scouting_notes(tournament_id);
CREATE INDEX idx_scouting_notes_team       ON scouting_notes(team_id);
