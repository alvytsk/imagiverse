CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"icon_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name"),
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_photos_category" ON "photos" USING btree ("category_id");--> statement-breakpoint
INSERT INTO "categories" ("name", "slug", "display_order") VALUES
  ('Landscape', 'landscape', 1),
  ('Portrait', 'portrait', 2),
  ('Street', 'street', 3),
  ('Wildlife', 'wildlife', 4),
  ('Architecture', 'architecture', 5),
  ('Nature', 'nature', 6),
  ('Abstract', 'abstract', 7),
  ('Black & White', 'black-and-white', 8),
  ('Travel', 'travel', 9),
  ('Other', 'other', 10);