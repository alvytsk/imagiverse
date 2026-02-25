CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    payload    JSONB NOT NULL,
    read       BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX idx_notifications_user_unread ON notifications (user_id) WHERE read = false;
