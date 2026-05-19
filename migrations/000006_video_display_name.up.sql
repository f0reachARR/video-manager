-- Human-friendly label shown in the UI instead of the opaque storage_key.
-- Initially set from the tus filename metadata at upload time; editable later.
ALTER TABLE videos
    ADD COLUMN display_name text NOT NULL DEFAULT '';
