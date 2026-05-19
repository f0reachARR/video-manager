-- Make Run timeline duration explicit (was previously derived from videos),
-- and let each angle video sit at an arbitrary offset within the Run timeline
-- instead of pinning videoOffsetStartSec to run time 0.

ALTER TABLE runs
    ADD COLUMN duration_sec integer NOT NULL DEFAULT 0
        CHECK (duration_sec >= 0);

ALTER TABLE run_videos
    ADD COLUMN run_offset_sec integer NOT NULL DEFAULT 0
        CHECK (run_offset_sec >= 0);

-- Backfill: existing runs get duration_sec = max(video segment length) so the
-- old derived timeline length is preserved.
UPDATE runs r
SET duration_sec = COALESCE((
    SELECT MAX(video_offset_end - video_offset_start)
    FROM run_videos
    WHERE run_id = r.id
), 0);
