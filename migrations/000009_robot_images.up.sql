-- Robot に紐付く写真。
--
-- 並び順は撮影日時 (EXIF DateTimeOriginal) を優先し、
-- 不明な画像は created_at にフォールバック。`sort_at` を生成カラムに
-- して両者を一本の index で扱う。
CREATE TABLE robot_images (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    robot_id             uuid        NOT NULL REFERENCES robots(id) ON DELETE CASCADE,

    storage_key          text        NOT NULL,
    content_type         text        NOT NULL,

    -- HEIC など browser が直接表示できないフォーマット、または EXIF
    -- orientation を焼き込んだ場合のみセット。NULL のときは storage_key
    -- をそのまま raw 配信する。
    display_key          text,
    display_content_type text,

    thumbnail_key        text        NOT NULL,
    size_bytes           bigint      NOT NULL,
    width                integer,
    height               integer,

    captured_at          timestamptz,
    exif_orientation     smallint,

    caption              text        NOT NULL DEFAULT '',
    uploader_id          uuid        REFERENCES users(id) ON DELETE SET NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),

    sort_at              timestamptz GENERATED ALWAYS AS (COALESCE(captured_at, created_at)) STORED
);

CREATE INDEX robot_images_robot_sort_idx ON robot_images (robot_id, sort_at);

-- primary_image_id は ON DELETE SET NULL なので画像削除時にも整合する。
ALTER TABLE robots
    ADD COLUMN primary_image_id uuid REFERENCES robot_images(id) ON DELETE SET NULL;
