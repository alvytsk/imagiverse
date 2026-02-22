import { relations } from 'drizzle-orm';
import {
  bigint,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ============================================================================
// Users
// ============================================================================
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    username: text('username').notNull().unique(),
    displayName: text('display_name').notNull(),
    city: text('city'),
    passwordHash: text('password_hash').notNull(),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    role: text('role').notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Generated search columns (managed by migration SQL via GENERATED ALWAYS AS)
    // Declared here as selectable columns; generation is handled by Postgres
    searchName: text('search_name'),
    searchUser: text('search_user'),
    searchCity: text('search_city'),
  },
  (table) => [
    index('idx_users_search_name').on(table.searchName),
    index('idx_users_search_user').on(table.searchUser),
    index('idx_users_search_city').on(table.searchCity),
  ]
);

// ============================================================================
// Photos
// ============================================================================
export const photos = pgTable(
  'photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    caption: text('caption'),
    status: text('status').notNull().default('processing'),
    originalKey: text('original_key').notNull(),
    thumbSmallKey: text('thumb_small_key'),
    thumbMediumKey: text('thumb_medium_key'),
    thumbLargeKey: text('thumb_large_key'),
    width: integer('width'),
    height: integer('height'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    mimeType: text('mime_type'),
    likeCount: integer('like_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_photos_user').on(table.userId),
    index('idx_photos_created').on(table.createdAt),
    index('idx_photos_status').on(table.status),
  ]
);

// ============================================================================
// Likes
// ============================================================================
export const likes = pgTable(
  'likes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    photoId: uuid('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.photoId] }),
    index('idx_likes_photo').on(table.photoId),
  ]
);

// ============================================================================
// Comments
// ============================================================================
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    photoId: uuid('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_comments_photo').on(table.photoId, table.createdAt)]
);

// ============================================================================
// Feed Scores (read model for ranked feed)
// ============================================================================
export const feedScores = pgTable(
  'feed_scores',
  {
    photoId: uuid('photo_id')
      .primaryKey()
      .references(() => photos.id, { onDelete: 'cascade' }),
    score: doublePrecision('score').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_feed_scores_rank').on(table.score)]
);

// ============================================================================
// Relations (for Drizzle relational queries)
// ============================================================================
export const usersRelations = relations(users, ({ many }) => ({
  photos: many(photos),
  likes: many(likes),
  comments: many(comments),
}));

export const photosRelations = relations(photos, ({ one, many }) => ({
  user: one(users, { fields: [photos.userId], references: [users.id] }),
  likes: many(likes),
  comments: many(comments),
  feedScore: one(feedScores, { fields: [photos.id], references: [feedScores.photoId] }),
}));

export const likesRelations = relations(likes, ({ one }) => ({
  user: one(users, { fields: [likes.userId], references: [users.id] }),
  photo: one(photos, { fields: [likes.photoId], references: [photos.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  user: one(users, { fields: [comments.userId], references: [users.id] }),
  photo: one(photos, { fields: [comments.photoId], references: [photos.id] }),
}));
