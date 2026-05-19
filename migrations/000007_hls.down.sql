DROP TABLE IF EXISTS video_renditions;

ALTER TABLE videos
    DROP COLUMN IF EXISTS passthrough_ok,
    DROP COLUMN IF EXISTS source_height,
    DROP COLUMN IF EXISTS source_width,
    DROP COLUMN IF EXISTS source_audio_codec,
    DROP COLUMN IF EXISTS source_video_codec,
    DROP COLUMN IF EXISTS hls_status,
    DROP COLUMN IF EXISTS hls_master_key;

DROP TYPE IF EXISTS rendition_status;
DROP TYPE IF EXISTS rendition_kind;
DROP TYPE IF EXISTS hls_status;
