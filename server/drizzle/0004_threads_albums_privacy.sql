-- V2.5.1: Threaded comments — add parent_id for reply-to support
ALTER TABLE "comments" ADD COLUMN "parent_id" uuid REFERENCES "comments"("id") ON DELETE CASCADE;
CREATE INDEX "idx_comments_parent" ON "comments"("parent_id");

-- V2.5.4: Photo albums/collections
CREATE TABLE IF NOT EXISTS "albums" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_albums_user" ON "albums"("user_id");

CREATE TABLE IF NOT EXISTS "album_photos" (
  "album_id" uuid NOT NULL REFERENCES "albums"("id") ON DELETE CASCADE,
  "photo_id" uuid NOT NULL REFERENCES "photos"("id") ON DELETE CASCADE,
  "added_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("album_id", "photo_id")
);

CREATE INDEX "idx_album_photos_photo" ON "album_photos"("photo_id");

-- V2.5.5: Private photos — visibility column
ALTER TABLE "photos" ADD COLUMN "visibility" text NOT NULL DEFAULT 'public';
CREATE INDEX "idx_photos_visibility" ON "photos"("visibility");
