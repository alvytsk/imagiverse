-- Migration: 0000_initial_schema
-- Creates all core tables for the Imagiverse MVP

-- ============================================================================
-- Extensions (idempotent — safe to re-run)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================================
-- Users
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL,
    username      TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    city          TEXT,
    password_hash TEXT NOT NULL,
    avatar_url    TEXT,
    bio           TEXT,
    role          TEXT NOT NULL DEFAULT 'user',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_unique    UNIQUE (email),
    CONSTRAINT users_username_unique UNIQUE (username),
    CONSTRAINT users_role_check      CHECK (role IN ('user', 'admin'))
);

-- Generated search columns (auto-updated by Postgres on insert/update)
-- These allow case-insensitive, diacritics-insensitive trigram search.
ALTER TABLE users ADD COLUMN IF NOT EXISTS search_name TEXT GENERATED ALWAYS AS (
    unaccent(lower(display_name))
) STORED;

ALTER TABLE users ADD COLUMN IF NOT EXISTS search_user TEXT GENERATED ALWAYS AS (
    unaccent(lower(username))
) STORED;

ALTER TABLE users ADD COLUMN IF NOT EXISTS search_city TEXT GENERATED ALWAYS AS (
    unaccent(lower(coalesce(city, '')))
) STORED;

-- GIN indexes for trigram similarity (used in M6 user search)
CREATE INDEX IF NOT EXISTS idx_users_search_name ON users USING gin (search_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_search_user ON users USING gin (search_user gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_search_city ON users USING gin (search_city gin_trgm_ops);

-- ============================================================================
-- Photos
-- ============================================================================
CREATE TABLE IF NOT EXISTS photos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    caption          TEXT,
    status           TEXT NOT NULL DEFAULT 'processing',
    original_key     TEXT NOT NULL,
    thumb_small_key  TEXT,
    thumb_medium_key TEXT,
    thumb_large_key  TEXT,
    width            INT,
    height           INT,
    size_bytes       BIGINT,
    mime_type        TEXT,
    like_count       INT NOT NULL DEFAULT 0,
    comment_count    INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT photos_status_check CHECK (status IN ('processing', 'ready', 'failed', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_photos_user    ON photos(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_created ON photos(created_at DESC);
-- Partial index: only index photos that are ready (avoids indexing processing/failed/deleted)
CREATE INDEX IF NOT EXISTS idx_photos_ready   ON photos(created_at DESC) WHERE status = 'ready';

-- ============================================================================
-- Likes
-- ============================================================================
CREATE TABLE IF NOT EXISTS likes (
    user_id    UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    photo_id   UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, photo_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_photo ON likes(photo_id);

-- ============================================================================
-- Comments
-- ============================================================================
CREATE TABLE IF NOT EXISTS comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id   UUID NOT NULL REFERENCES photos(id)  ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT comments_body_length CHECK (char_length(body) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_comments_photo ON comments(photo_id, created_at);

-- ============================================================================
-- Feed Scores (materialized ranking read model — see §7 of DEVELOPMENT_PLAN.md)
-- ============================================================================
CREATE TABLE IF NOT EXISTS feed_scores (
    photo_id   UUID PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
    score      DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- B-tree DESC index for cursor-paginated feed queries
CREATE INDEX IF NOT EXISTS idx_feed_scores_rank ON feed_scores(score DESC);

-- ============================================================================
-- updated_at auto-maintenance trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['users', 'photos', 'comments'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = t || '_updated_at'
              AND tgrelid = t::regclass
        ) THEN
            EXECUTE format(
                'CREATE TRIGGER %I_updated_at
                 BEFORE UPDATE ON %I
                 FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
                t, t
            );
        END IF;
    END LOOP;
END
$$;
