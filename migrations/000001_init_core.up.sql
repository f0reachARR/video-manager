-- Phase 1 の初期スキーマ。spec.md §4 の ER に基づく。
-- Phase 1 の UI で使わないテーブル（Team / Tournament / Match / ScoutingNote / Annotation）も
-- 後続差分を小さくするためここで切る。
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- ENUM 型 ----------
CREATE TYPE session_mode_hint AS ENUM ('practice', 'pre_match');
CREATE TYPE marker_category   AS ENUM ('success', 'failure', 'note');
CREATE TYPE annotation_type   AS ENUM ('point', 'arrow', 'rect', 'path', 'text');

-- ---------- マスタ ----------
CREATE TABLE users (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL,
    color       text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
    id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                     text        NOT NULL,
    default_time_offset_sec  integer     NOT NULL DEFAULT 0,
    created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teams (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL,
    is_own      boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tournaments (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL,
    start_date  date,
    end_date    date,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE matches (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id   uuid        NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_a_id       uuid        NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    team_b_id       uuid        NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    scheduled_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (team_a_id <> team_b_id)
);

CREATE TABLE robots (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id     uuid        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name        text        NOT NULL,
    version     text        NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (team_id, name, version)
);

CREATE TABLE scenarios (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL UNIQUE,
    description text        NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tags (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL UNIQUE,
    color       text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Session / Video / Run ----------
CREATE TABLE sessions (
    id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text                NOT NULL,
    started_at      timestamptz,
    ended_at        timestamptz,
    location        text,
    mode_hint       session_mode_hint   NOT NULL DEFAULT 'practice',
    tournament_id   uuid                REFERENCES tournaments(id) ON DELETE SET NULL,
    created_at      timestamptz         NOT NULL DEFAULT now()
);

CREATE TABLE videos (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      uuid        REFERENCES sessions(id) ON DELETE SET NULL,
    device_id       uuid        REFERENCES devices(id)  ON DELETE SET NULL,
    uploader_id     uuid        REFERENCES users(id)    ON DELETE SET NULL,
    storage_key     text        NOT NULL UNIQUE,
    recorded_at     timestamptz,
    duration_sec    integer,
    time_offset_sec integer     NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE runs (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    team_id         uuid        NOT NULL REFERENCES teams(id)    ON DELETE RESTRICT,
    robot_id        uuid        NOT NULL REFERENCES robots(id)   ON DELETE RESTRICT,
    scenario_id     uuid        NOT NULL REFERENCES scenarios(id) ON DELETE RESTRICT,
    match_id        uuid        REFERENCES matches(id) ON DELETE SET NULL,
    started_at      timestamptz NOT NULL,
    ended_at        timestamptz NOT NULL,
    score           double precision,
    memo            text        NOT NULL DEFAULT '',
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (ended_at >= started_at)
);

CREATE TABLE run_videos (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id              uuid        NOT NULL REFERENCES runs(id)   ON DELETE CASCADE,
    video_id            uuid        NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    video_offset_start  integer     NOT NULL,
    video_offset_end    integer     NOT NULL,
    angle_label         text        NOT NULL DEFAULT '',
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, video_id),
    CHECK (video_offset_end >= video_offset_start)
);

-- ---------- Marker / Annotation ----------
CREATE TABLE markers (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          uuid            NOT NULL REFERENCES runs(id)  ON DELETE CASCADE,
    author_id       uuid            REFERENCES users(id) ON DELETE SET NULL,
    run_offset_sec  integer         NOT NULL,
    label           text            NOT NULL DEFAULT '',
    category        marker_category NOT NULL DEFAULT 'note',
    created_at      timestamptz     NOT NULL DEFAULT now()
);

CREATE TABLE annotations (
    id                  uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id            uuid                NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    author_id           uuid                REFERENCES users(id) ON DELETE SET NULL,
    start_offset_sec    double precision    NOT NULL,
    end_offset_sec      double precision    NOT NULL,
    type                annotation_type     NOT NULL,
    geometry            jsonb               NOT NULL,
    style               jsonb               NOT NULL DEFAULT '{}'::jsonb,
    label               text                NOT NULL DEFAULT '',
    created_at          timestamptz         NOT NULL DEFAULT now(),
    CHECK (end_offset_sec >= start_offset_sec)
);

-- ---------- ScoutingNote ----------
CREATE TABLE scouting_notes (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id        uuid        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    target_team_id  uuid        NOT NULL REFERENCES teams(id)   ON DELETE CASCADE,
    ydoc_state      bytea,
    plain_text      text        NOT NULL DEFAULT '',
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (match_id, target_team_id)
);

-- ---------- 中間テーブル ----------
CREATE TABLE run_tags (
    run_id  uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    tag_id  uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (run_id, tag_id)
);

CREATE TABLE video_tags (
    video_id  uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    tag_id    uuid NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
    PRIMARY KEY (video_id, tag_id)
);

-- ---------- 通常インデックス ----------
CREATE INDEX idx_videos_session_id   ON videos(session_id);
CREATE INDEX idx_videos_device_id    ON videos(device_id);
CREATE INDEX idx_videos_recorded_at  ON videos(recorded_at);

CREATE INDEX idx_runs_session_id  ON runs(session_id);
CREATE INDEX idx_runs_team_id     ON runs(team_id);
CREATE INDEX idx_runs_robot_id    ON runs(robot_id);
CREATE INDEX idx_runs_scenario_id ON runs(scenario_id);
CREATE INDEX idx_runs_match_id    ON runs(match_id);
CREATE INDEX idx_runs_started_at  ON runs(started_at);

CREATE INDEX idx_run_videos_run_id   ON run_videos(run_id);
CREATE INDEX idx_run_videos_video_id ON run_videos(video_id);

CREATE INDEX idx_markers_run_id     ON markers(run_id);
CREATE INDEX idx_markers_run_offset ON markers(run_id, run_offset_sec);
CREATE INDEX idx_markers_category   ON markers(category);

CREATE INDEX idx_annotations_video_id   ON annotations(video_id);
CREATE INDEX idx_annotations_video_time ON annotations(video_id, start_offset_sec);

CREATE INDEX idx_sessions_started_at ON sessions(started_at);
CREATE INDEX idx_sessions_mode_hint  ON sessions(mode_hint);
CREATE INDEX idx_sessions_tournament ON sessions(tournament_id);

CREATE INDEX idx_matches_tournament ON matches(tournament_id);
CREATE INDEX idx_matches_team_a     ON matches(team_a_id);
CREATE INDEX idx_matches_team_b     ON matches(team_b_id);

CREATE INDEX idx_scouting_notes_match ON scouting_notes(match_id);
CREATE INDEX idx_scouting_notes_team  ON scouting_notes(target_team_id);
