-- Server-side dedup memory for the on-site bulk upload flow. The browser
-- hashes the first 1 MiB of each file (SHA-256) and pairs it with the byte
-- size; the API records (tournament_id, head_hash, size_bytes) so the same
-- file picked from a re-opened tab — or even from a different browser — is
-- recognized as already uploaded. Per-tournament so a one-button "clear"
-- before a new tournament wipes only that tournament's memory.
CREATE TABLE bulk_upload_fingerprints (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id  uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    head_hash      bytea NOT NULL,         -- SHA-256 of first 1 MiB (32 bytes)
    size_bytes     bigint NOT NULL,
    filename       text NOT NULL,
    media_kind     text NOT NULL,          -- 'video' | 'image'
    video_id       uuid REFERENCES videos(id)       ON DELETE SET NULL,
    robot_image_id uuid REFERENCES robot_images(id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tournament_id, head_hash, size_bytes)
);

CREATE INDEX bulk_upload_fingerprints_tournament_idx
    ON bulk_upload_fingerprints(tournament_id, created_at DESC);

CREATE INDEX bulk_upload_fingerprints_video_idx
    ON bulk_upload_fingerprints(video_id) WHERE video_id IS NOT NULL;

CREATE INDEX bulk_upload_fingerprints_robot_image_idx
    ON bulk_upload_fingerprints(robot_image_id) WHERE robot_image_id IS NOT NULL;
