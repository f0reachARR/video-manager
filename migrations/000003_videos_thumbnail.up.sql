-- Phase 1 仕上げ: ffmpeg で生成したサムネイル画像の Object Store キーを保持する。
ALTER TABLE videos
    ADD COLUMN thumbnail_key text;
