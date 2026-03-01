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

const { users, photos, likes, comments, feedScores, notifications, albums, albumPhotos, categories } = schema;

const SEED_PASSWORD = 'Password1!';
const USER_COUNT = 100;
const PHOTO_COUNT = 1000;
const LIKE_COUNT = 5000;
const COMMENT_COUNT = 2000;
const BCRYPT_ROUNDS = 4; // Fast for seeding
const ALBUM_COUNT = 50;

const CAMERA_MAKES = ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Panasonic', 'Olympus', 'Leica'];
const CAMERA_MODELS: Record<string, string[]> = {
  Canon: ['EOS R5', 'EOS R6', 'EOS 5D Mark IV', 'EOS 90D'],
  Nikon: ['Z6 III', 'Z8', 'D850', 'Z fc'],
  Sony: ['A7 IV', 'A7R V', 'A6700', 'A1'],
  Fujifilm: ['X-T5', 'X-H2', 'X100VI', 'GFX 100S'],
  Panasonic: ['Lumix S5 II', 'Lumix GH6', 'Lumix G9 II'],
  Olympus: ['OM-1', 'E-M1 Mark III', 'PEN E-P7'],
  Leica: ['Q3', 'M11', 'SL2-S'],
};

function generateExifData() {
  // ~70% of photos have EXIF data
  if (Math.random() > 0.7) return null;

  const make = CAMERA_MAKES[Math.floor(Math.random() * CAMERA_MAKES.length)];
  const models = CAMERA_MODELS[make];
  const model = models[Math.floor(Math.random() * models.length)];

  const focalLength = faker.helpers.arrayElement([24, 35, 50, 85, 100, 135, 200]);

  return {
    cameraMake: make,
    cameraModel: model,
    lensMake: faker.helpers.arrayElement([make, null]),
    lensModel: faker.helpers.arrayElement([
      `${focalLength}mm f/1.8`,
      `${focalLength}-${focalLength * 2}mm f/2.8`,
      `${focalLength}mm f/1.4`,
      null,
    ]),
    focalLength,
    focalLengthIn35mm: faker.helpers.arrayElement([focalLength, Math.round(focalLength * 1.5), null]),
    fNumber: faker.helpers.arrayElement([1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0, 11.0]),
    exposureTime: faker.helpers.arrayElement(['1/30s', '1/60s', '1/125s', '1/250s', '1/500s', '1/1000s', '1/2000s']),
    iso: faker.helpers.arrayElement([100, 200, 400, 800, 1600, 3200, 6400]),
    dateTimeOriginal: faker.date.recent({ days: 30 }).toISOString(),
    flash: faker.helpers.arrayElement([true, false, null]),
    exposureProgram: faker.helpers.arrayElement(['Manual', 'Aperture Priority', 'Shutter Priority', 'Normal', null]),
    meteringMode: faker.helpers.arrayElement(['Multi-segment', 'Center-weighted', 'Spot', null]),
    whiteBalance: faker.helpers.arrayElement(['Auto', 'Manual', null]),
  };
}

async function seed() {
  console.log('Connecting to database...');
  const queryClient = postgres(env.DATABASE_URL, { max: 10 });
  const db = drizzle(queryClient, { schema });

  try {
    // ── Truncate ──────────────────────────────────────────────────────────────
    console.log('Truncating existing data...');
    await db.execute(sql`TRUNCATE notifications, album_photos, albums, reports, feed_scores, comments, likes, photos, categories, users CASCADE`);

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
        role: i === 0 ? 'admin' : 'user',
      };
    });

    const insertedUsers = await db.insert(users).values(userValues).returning({ id: users.id });
    const userIds = insertedUsers.map((u) => u.id);
    console.log(`  Created ${userIds.length} users.`);

    // ── Categories ─────────────────────────────────────────────────────────────
    console.log('Inserting categories...');
    const categoryValues = [
      { name: 'Landscape', slug: 'landscape', displayOrder: 1 },
      { name: 'Portrait', slug: 'portrait', displayOrder: 2 },
      { name: 'Street', slug: 'street', displayOrder: 3 },
      { name: 'Wildlife', slug: 'wildlife', displayOrder: 4 },
      { name: 'Architecture', slug: 'architecture', displayOrder: 5 },
      { name: 'Nature', slug: 'nature', displayOrder: 6 },
      { name: 'Abstract', slug: 'abstract', displayOrder: 7 },
      { name: 'Black & White', slug: 'black-and-white', displayOrder: 8 },
      { name: 'Travel', slug: 'travel', displayOrder: 9 },
      { name: 'Other', slug: 'other', displayOrder: 10 },
    ];
    const insertedCategories = await db.insert(categories).values(categoryValues).returning({ id: categories.id });
    const categoryIds = insertedCategories.map((c) => c.id);
    console.log(`  Created ${categoryIds.length} categories.`);

    // ── Photos ────────────────────────────────────────────────────────────────
    console.log(`Creating ${PHOTO_COUNT} photos...`);

    const photoValues = Array.from({ length: PHOTO_COUNT }, () => {
      const userId = userIds[Math.floor(Math.random() * userIds.length)];
      const photoId = crypto.randomUUID();
      // 80% of photos get a category, 20% are uncategorized
      const categoryId = Math.random() < 0.8
        ? categoryIds[Math.floor(Math.random() * categoryIds.length)]
        : null;
      return {
        id: photoId,
        userId,
        categoryId,
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
        blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj', // static placeholder blurhash
        exifData: generateExifData(),
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

    // ── Albums ────────────────────────────────────────────────────────────────
    console.log(`Creating ${ALBUM_COUNT} albums...`);
    const albumValues = Array.from({ length: ALBUM_COUNT }, () => ({
      userId: userIds[Math.floor(Math.random() * userIds.length)],
      name: faker.lorem.words({ min: 1, max: 3 }),
      description: faker.lorem.sentence(),
      createdAt: faker.date.recent({ days: 30 }),
    }));

    const insertedAlbums = await db.insert(albums).values(albumValues).returning({ id: albums.id, userId: albums.userId });
    console.log(`  Created ${insertedAlbums.length} albums.`);

    // Add 3-10 random photos to each album
    const albumPhotoValues: Array<{ albumId: string; photoId: string }> = [];
    for (const album of insertedAlbums) {
      const count = faker.number.int({ min: 3, max: 10 });
      const shuffled = [...photoIds].sort(() => Math.random() - 0.5);
      for (let i = 0; i < count; i++) {
        albumPhotoValues.push({ albumId: album.id, photoId: shuffled[i] });
      }
    }

    for (let i = 0; i < albumPhotoValues.length; i += BATCH_SIZE) {
      const batch = albumPhotoValues.slice(i, i + BATCH_SIZE);
      await db.insert(albumPhotos).values(batch);
    }
    console.log(`  Added ${albumPhotoValues.length} photos to albums.`);

    // ── Notifications ────────────────────────────────────────────────────────
    console.log('Creating sample notifications...');
    const notifValues: Array<{ userId: string; type: string; payload: unknown; read: boolean; createdAt: Date }> = [];

    // Generate like notifications for the first 200 likes
    for (let i = 0; i < Math.min(200, likeValues.length); i++) {
      const like = likeValues[i];
      // Find photo owner
      const photo = photoValues.find((p) => p.id === like.photoId);
      if (photo && photo.userId !== like.userId) {
        notifValues.push({
          userId: photo.userId,
          type: 'like',
          payload: { photoId: like.photoId, actorId: like.userId },
          read: Math.random() > 0.3,
          createdAt: faker.date.recent({ days: 7 }),
        });
      }
    }

    if (notifValues.length > 0) {
      for (let i = 0; i < notifValues.length; i += BATCH_SIZE) {
        const batch = notifValues.slice(i, i + BATCH_SIZE);
        await db.insert(notifications).values(batch);
      }
    }
    console.log(`  Created ${notifValues.length} notifications.`);

    console.log('\nSeed complete!');
    console.log(
      `  ${USER_COUNT} users (login: user1@example.com / ${SEED_PASSWORD}; user1 is admin)`
    );
    console.log(`  ${categoryIds.length} categories`);
    console.log(`  ${PHOTO_COUNT} photos`);
    console.log(`  ${likeValues.length} likes`);
    console.log(`  ${COMMENT_COUNT} comments`);
    console.log(`  ${insertedAlbums.length} albums`);
    console.log(`  ${notifValues.length} notifications`);
    console.log('  Feed scores recalculated');
  } finally {
    await queryClient.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
