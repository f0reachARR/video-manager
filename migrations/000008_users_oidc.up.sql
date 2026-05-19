-- OIDC 認証用に users を拡張する。
--
-- - oidc_sub: IdP が発行する subject。同一 IdP 内で安定して一意。
--   UNIQUE 制約は NULL を複数許容するので、既存 users (oidc_sub IS NULL) は
--   競合しない。
-- - email: 初回ログイン時の自動リンク用 + 表示補助。CITEXT は使わず lower()
--   ベースで部分インデックスを張る (拡張に依存しない)。
ALTER TABLE users
    ADD COLUMN oidc_sub text,
    ADD COLUMN email    text;

CREATE UNIQUE INDEX users_oidc_sub_idx
    ON users (oidc_sub)
    WHERE oidc_sub IS NOT NULL;

CREATE UNIQUE INDEX users_email_lower_idx
    ON users (lower(email))
    WHERE email IS NOT NULL;
