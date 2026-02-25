-- Migration: 0002_admin_moderation
-- Adds photo reports table, user ban support, and comment flagging for moderation

-- ============================================================================
-- Reports (users can report photos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id    UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX idx_reports_photo ON reports (photo_id);
--> statement-breakpoint
CREATE INDEX idx_reports_status ON reports (status);
--> statement-breakpoint
CREATE INDEX idx_reports_created ON reports (created_at DESC);
--> statement-breakpoint
ALTER TABLE reports ADD CONSTRAINT uq_reports_photo_reporter UNIQUE (photo_id, reporter_id);
--> statement-breakpoint

-- ============================================================================
-- User banning
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
--> statement-breakpoint

-- ============================================================================
-- Comment flagging (spam detection)
-- ============================================================================
ALTER TABLE comments ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE INDEX idx_comments_flagged ON comments (flagged) WHERE flagged = true;
