/**
 * Seed script — populates the database with realistic test data.
 *
 * Creates:
 * - 100 users (all with password "Password1!")
 * - 1000 photos distributed across users
 * - ~5000 random likes
 * - ~2000 random comments
 * - Recalculates feed_scores for all photos
 *
 * Usage: pnpm --filter server db:seed
 * Or from root: pnpm seed
 *
 * Idempotent: truncates all data before seeding.
 */
import '../load-env';

import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sanitizeHtml from 'sanitize-html';
import { env } from '../config/env';
import * as schema from '../db/schema/index';

const { users, photos, likes, comments, feedScores } = schema;

const SEED_PASSWORD = 'Password1!';
const USER_COUNT = 100;
const PHOTO_COUNT = 1000;
const LIKE_COUNT = 5000;
const COMMENT_COUNT = 2000;
const BCRYPT_ROUNDS = 4; // Fast for seeding

async function seed() {
  console.log('Connecting to database...');
  const queryClient = postgres(env.DATABASE_URL, { max: 10 });
  const db = drizzle(queryClient, { schema });

  try {
    // ── Truncate ──────────────────────────────────────────────────────────────
    console.log('Truncating existing data...');
    await db.execute(sql`TRUNCATE feed_scores, comments, likes, photos, users CASCADE`);

    // ── Users ─────────────────────────────────────────────────────────────────
    console.log(`Creating ${USER_COUNT} users...`);
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

    const userValues = Array.from({ length: USER_COUNT }, (_, i) => {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      return {
        email: `user${i + 1}@example.com`,
        username: `user${i + 1}`,
        displayName: `${firstName} ${lastName}`,
        city: faker.location.city(),
        bio: faker.lorem.sentence(),
        passwordHash,
      };
    });

    const insertedUsers = await db.insert(users).values(userValues).returning({ id: users.id });
    const userIds = insertedUsers.map((u) => u.id);
    console.log(`  Created ${userIds.length} users.`);

    // ── Photos ────────────────────────────────────────────────────────────────
    console.log(`Creating ${PHOTO_COUNT} photos...`);

    const photoValues = Array.from({ length: PHOTO_COUNT }, () => {
      const userId = userIds[Math.floor(Math.random() * userIds.length)];
      const photoId = crypto.randomUUID();
      return {
        id: photoId,
        userId,
        caption: sanitizeHtml(faker.lorem.sentence(), { allowedTags: [], allowedAttributes: {} }),
        status: 'ready' as const,
        originalKey: `originals/${userId}/${photoId}.jpg`,
        thumbSmallKey: `thumbs/${photoId}/small.webp`,
        thumbMediumKey: `thumbs/${photoId}/medium.webp`,
        thumbLargeKey: `thumbs/${photoId}/large.webp`,
        width: faker.number.int({ min: 800, max: 4000 }),
        height: faker.number.int({ min: 600, max: 3000 }),
        mimeType: 'image/jpeg',
        sizeBytes: faker.number.int({ min: 50000, max: 5000000 }),
        // Spread creation dates over the last 30 days
        createdAt: faker.date.recent({ days: 30 }),
      };
    });

    // Insert in batches to avoid query size limits
    const BATCH_SIZE = 100;
    const insertedPhotos: Array<{ id: string }> = [];
    for (let i = 0; i < photoValues.length; i += BATCH_SIZE) {
      const batch = photoValues.slice(i, i + BATCH_SIZE);
      const result = await db.insert(photos).values(batch).returning({ id: photos.id });
      insertedPhotos.push(...result);
    }
    const photoIds = insertedPhotos.map((p) => p.id);
    console.log(`  Created ${photoIds.length} photos.`);

    // ── Likes ─────────────────────────────────────────────────────────────────
    console.log(`Creating ~${LIKE_COUNT} likes...`);
    const likeSet = new Set<string>();
    const likeValues: Array<{ userId: string; photoId: string }> = [];

    while (likeValues.length < LIKE_COUNT) {
      const userId = userIds[Math.floor(Math.random() * userIds.length)];
      const photoId = photoIds[Math.floor(Math.random() * photoIds.length)];
      const key = `${userId}:${photoId}`;

      if (!likeSet.has(key)) {
        likeSet.add(key);
        likeValues.push({ userId, photoId });
      }
    }

    for (let i = 0; i < likeValues.length; i += BATCH_SIZE) {
      const batch = likeValues.slice(i, i + BATCH_SIZE);
      await db.insert(likes).values(batch);
    }
    console.log(`  Created ${likeValues.length} likes.`);

    // Update denormalized like counts
    console.log('  Updating denormalized like counts...');
    await db.execute(sql`
      UPDATE photos SET like_count = (
        SELECT COUNT(*) FROM likes WHERE likes.photo_id = photos.id
      )
    `);

    // ── Comments ──────────────────────────────────────────────────────────────
    console.log(`Creating ${COMMENT_COUNT} comments...`);
    const commentValues = Array.from({ length: COMMENT_COUNT }, () => ({
      userId: userIds[Math.floor(Math.random() * userIds.length)],
      photoId: photoIds[Math.floor(Math.random() * photoIds.length)],
      body: sanitizeHtml(faker.lorem.sentence(), { allowedTags: [], allowedAttributes: {} }),
      createdAt: faker.date.recent({ days: 30 }),
    }));

    for (let i = 0; i < commentValues.length; i += BATCH_SIZE) {
      const batch = commentValues.slice(i, i + BATCH_SIZE);
      await db.insert(comments).values(batch);
    }
    console.log(`  Created ${COMMENT_COUNT} comments.`);

    // Update denormalized comment counts
    console.log('  Updating denormalized comment counts...');
    await db.execute(sql`
      UPDATE photos SET comment_count = (
        SELECT COUNT(*) FROM comments WHERE comments.photo_id = photos.id
      )
    `);

    // ── Feed scores ───────────────────────────────────────────────────────────
    console.log('Recalculating feed scores...');
    await db.execute(sql`
      INSERT INTO feed_scores (photo_id, score, updated_at)
      SELECT
        p.id,
        (p.like_count + 1)::double precision
          / POWER(
              GREATEST(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600, 0) + 2,
              1.5
            ),
        now()
      FROM photos p
      WHERE p.status = 'ready'
      ON CONFLICT (photo_id) DO UPDATE SET
        score = EXCLUDED.score,
        updated_at = EXCLUDED.updated_at
    `);

    console.log('\nSeed complete!');
    console.log(`  ${USER_COUNT} users (login: user1@example.com / ${SEED_PASSWORD})`);
    console.log(`  ${PHOTO_COUNT} photos`);
    console.log(`  ${likeValues.length} likes`);
    console.log(`  ${COMMENT_COUNT} comments`);
    console.log('  Feed scores recalculated');
  } finally {
    await queryClient.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
