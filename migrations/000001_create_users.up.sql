CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL,
    color       text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
