-- Robots become (tournament, team) scoped instead of M:N via tournament_robots.
-- A robot row is now unique within a single tournament+team — the same physical
-- robot used at two tournaments lives as two rows. Dev-only; destructive.

ALTER TABLE robots
    ADD COLUMN tournament_id uuid REFERENCES tournaments(id) ON DELETE CASCADE;

-- Best-effort backfill: when a robot is registered to exactly one tournament
-- we adopt that tournament_id; otherwise we drop the row.
UPDATE robots r
   SET tournament_id = tr.tournament_id
  FROM tournament_robots tr
 WHERE tr.robot_id = r.id
   AND (SELECT count(*) FROM tournament_robots WHERE robot_id = r.id) = 1;

-- runs.robot_id is ON DELETE RESTRICT — clear dependents before dropping the
-- ambiguous robots. Dev-only, so the cascade through markers/run_videos is OK.
DELETE FROM runs WHERE robot_id IN (SELECT id FROM robots WHERE tournament_id IS NULL);
DELETE FROM robots WHERE tournament_id IS NULL;

ALTER TABLE robots ALTER COLUMN tournament_id SET NOT NULL;

ALTER TABLE robots DROP CONSTRAINT robots_team_id_name_version_key;
ALTER TABLE robots
    ADD CONSTRAINT robots_tournament_team_name_version_key
        UNIQUE (tournament_id, team_id, name, version);

CREATE INDEX idx_robots_tournament      ON robots(tournament_id);
CREATE INDEX idx_robots_tournament_team ON robots(tournament_id, team_id);

DROP TABLE tournament_robots;
