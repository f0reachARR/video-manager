ALTER TABLE runs
    ADD COLUMN ended_at timestamptz NOT NULL
        DEFAULT now();

-- Backfill from started_at + duration_sec so existing rows are self-consistent.
UPDATE runs
SET ended_at = started_at + (duration_sec || ' seconds')::interval;

ALTER TABLE runs ADD CHECK (ended_at >= started_at);
