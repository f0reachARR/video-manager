-- A2 採用: 大会への「参加チーム」と「持ち込みロボット」を別テーブルで持つ。
-- tournament_robots が空のチームは UI 側で「team の全ロボット」を fallback として候補に出す。
CREATE TABLE tournament_teams (
    tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id       uuid NOT NULL REFERENCES teams(id)       ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tournament_id, team_id)
);

CREATE INDEX tournament_teams_team_idx ON tournament_teams(team_id);

CREATE TABLE tournament_robots (
    tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    robot_id      uuid NOT NULL REFERENCES robots(id)      ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tournament_id, robot_id)
);

CREATE INDEX tournament_robots_robot_idx ON tournament_robots(robot_id);
