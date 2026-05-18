-- 全文検索向け pg_trgm インデックス。
-- spec-devflow.md §9 で運用上必要となる検索条件をカバーする。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_runs_memo_trgm
    ON runs USING gin (memo gin_trgm_ops);

CREATE INDEX idx_scouting_notes_plain_text_trgm
    ON scouting_notes USING gin (plain_text gin_trgm_ops);

CREATE INDEX idx_scenarios_name_trgm
    ON scenarios USING gin (name gin_trgm_ops);

CREATE INDEX idx_scenarios_description_trgm
    ON scenarios USING gin (description gin_trgm_ops);

CREATE INDEX idx_tags_name_trgm
    ON tags USING gin (name gin_trgm_ops);

CREATE INDEX idx_robots_name_trgm
    ON robots USING gin (name gin_trgm_ops);

CREATE INDEX idx_teams_name_trgm
    ON teams USING gin (name gin_trgm_ops);
