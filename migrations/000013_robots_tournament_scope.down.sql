-- down は形だけ用意。データは戻らない。

CREATE TABLE tournament_robots (
    tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    robot_id      uuid NOT NULL REFERENCES robots(id)      ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tournament_id, robot_id)
);
CREATE INDEX tournament_robots_robot_idx ON tournament_robots(robot_id);

DROP INDEX IF EXISTS idx_robots_tournament;
DROP INDEX IF EXISTS idx_robots_tournament_team;

ALTER TABLE robots
    DROP CONSTRAINT IF EXISTS robots_tournament_team_name_version_key;
ALTER TABLE robots
    ADD CONSTRAINT robots_team_id_name_version_key UNIQUE (team_id, name, version);

ALTER TABLE robots DROP COLUMN tournament_id;
