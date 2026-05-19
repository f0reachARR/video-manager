DROP INDEX IF EXISTS users_email_lower_idx;
DROP INDEX IF EXISTS users_oidc_sub_idx;

ALTER TABLE users
    DROP COLUMN IF EXISTS email,
    DROP COLUMN IF EXISTS oidc_sub;
