-- HLS 変換パイプライン (Phase 3)。
-- アップロード後に video.probe → video.hls.plan → encode_variant × N → finalize
-- の流れで動く。生ファイル (videos.storage_key) は引き続き保持し、HLS が ready
-- になるまでは MP4 フォールバックで再生する。

CREATE TYPE hls_status       AS ENUM ('pending', 'planning', 'encoding', 'ready', 'failed');
CREATE TYPE rendition_kind   AS ENUM ('original', '720p', '480p');
CREATE TYPE rendition_status AS ENUM ('pending', 'encoding', 'ready', 'failed');

ALTER TABLE videos
    ADD COLUMN hls_master_key     text,
    ADD COLUMN hls_status         hls_status NOT NULL DEFAULT 'pending',
    ADD COLUMN source_video_codec text,
    ADD COLUMN source_audio_codec text,
    ADD COLUMN source_width       integer,
    ADD COLUMN source_height      integer,
    ADD COLUMN passthrough_ok     boolean    NOT NULL DEFAULT false;

CREATE TABLE video_renditions (
    id              uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id        uuid             NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    kind            rendition_kind   NOT NULL,
    status          rendition_status NOT NULL DEFAULT 'pending',
    passthrough     boolean          NOT NULL DEFAULT false,
    width           integer          NOT NULL,
    height          integer          NOT NULL,
    bandwidth_bps   integer,
    playlist_key    text             NOT NULL,
    segments_done   integer          NOT NULL DEFAULT 0,
    error           text,
    started_at      timestamptz,
    completed_at    timestamptz,
    updated_at      timestamptz      NOT NULL DEFAULT now(),
    UNIQUE (video_id, kind)
);

CREATE INDEX video_renditions_video_id_idx ON video_renditions (video_id);
