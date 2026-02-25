/**
 * Factory functions for integration tests.
 *
 * All factories insert data into the real test database and return
 * the created entities.
 */
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { NotificationPayload, NotificationType } from 'imagiverse-shared';
import { comments, feedScores, likes, notifications, photos, users } from '../db/schema/index';
import { calculateFeedScore } from '../modules/feed/feed.formula';
import type { IntegrationContext } from './integration-setup';

const DEFAULT_PASSWORD = 'Password1!';
const BCRYPT_ROUNDS = 4; // Faster rounds for tests

export interface TestUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  password: string;
}

export async function createTestUser(
  db: IntegrationContext['db'],
  overrides: Partial<{
    email: string;
    username: string;
    displayName: string;
    city: string | null;
    bio: string | null;
    password: string;
  }> = {}
): Promise<TestUser> {
  const password = overrides.password ?? DEFAULT_PASSWORD;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const [user] = await db
    .insert(users)
    .values({
      email: overrides.email ?? faker.internet.email().toLowerCase(),
      username: overrides.username ?? faker.internet.username().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20),
      displayName: overrides.displayName ?? faker.person.fullName(),
      city: overrides.city !== undefined ? overrides.city : faker.location.city(),
      bio: overrides.bio !== undefined ? overrides.bio : faker.lorem.sentence(),
      passwordHash,
    })
    .returning({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
    });

  return { ...user, password };
}

export interface TestPhoto {
  id: string;
  userId: string;
  caption: string | null;
  status: string;
  originalKey: string;
}

export async function createTestPhoto(
  db: IntegrationContext['db'],
  userId: string,
  overrides: Partial<{
    caption: string | null;
    status: string;
    originalKey: string;
    thumbSmallKey: string | null;
    thumbMediumKey: string | null;
    thumbLargeKey: string | null;
    width: number | null;
    height: number | null;
  }> = {}
): Promise<TestPhoto> {
  const photoId = crypto.randomUUID();
  const [photo] = await db
    .insert(photos)
    .values({
      id: photoId,
      userId,
      caption: overrides.caption !== undefined ? overrides.caption : faker.lorem.sentence(),
      status: overrides.status ?? 'ready',
      originalKey: overrides.originalKey ?? `originals/${userId}/${photoId}.jpg`,
      thumbSmallKey: overrides.thumbSmallKey !== undefined ? overrides.thumbSmallKey : `thumbs/${photoId}/small.webp`,
      thumbMediumKey: overrides.thumbMediumKey !== undefined ? overrides.thumbMediumKey : `thumbs/${photoId}/medium.webp`,
      thumbLargeKey: overrides.thumbLargeKey !== undefined ? overrides.thumbLargeKey : `thumbs/${photoId}/large.webp`,
      width: overrides.width !== undefined ? overrides.width : 1920,
      height: overrides.height !== undefined ? overrides.height : 1080,
      mimeType: 'image/jpeg',
      sizeBytes: 50000,
    })
    .returning({
      id: photos.id,
      userId: photos.userId,
      caption: photos.caption,
      status: photos.status,
      originalKey: photos.originalKey,
    });

  return photo;
}

export async function createTestLike(
  db: IntegrationContext['db'],
  userId: string,
  photoId: string
): Promise<void> {
  await db.insert(likes).values({ userId, photoId });
  await db
    .update(photos)
    .set({ likeCount: sql`${photos.likeCount} + 1` })
    .where(eq(photos.id, photoId));
}

export async function createTestComment(
  db: IntegrationContext['db'],
  userId: string,
  photoId: string,
  body?: string
): Promise<{ id: string }> {
  const [comment] = await db
    .insert(comments)
    .values({
      userId,
      photoId,
      body: body ?? faker.lorem.sentence(),
    })
    .returning({ id: comments.id });

  await db
    .update(photos)
    .set({ commentCount: sql`${photos.commentCount} + 1` })
    .where(eq(photos.id, photoId));

  return comment;
}

export async function createTestFeedScore(
  db: IntegrationContext['db'],
  photoId: string,
  likeCount: number,
  createdAt: Date
): Promise<void> {
  const score = calculateFeedScore(likeCount, createdAt);
  await db
    .insert(feedScores)
    .values({ photoId, score, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: feedScores.photoId,
      set: { score, updatedAt: new Date() },
    });
}

export interface TestNotification {
  id: string;
  userId: string;
  type: string;
  payload: NotificationPayload;
  read: boolean;
}

export async function createTestNotification(
  db: IntegrationContext['db'],
  userId: string,
  overrides: Partial<{
    type: NotificationType;
    payload: NotificationPayload;
    read: boolean;
  }> = {}
): Promise<TestNotification> {
  const payload: NotificationPayload = overrides.payload ?? {
    actorId: crypto.randomUUID(),
    actorUsername: faker.internet.username().toLowerCase(),
    actorDisplayName: faker.person.fullName(),
    photoId: crypto.randomUUID(),
  };

  const [notification] = await db
    .insert(notifications)
    .values({
      userId,
      type: overrides.type ?? 'like',
      payload,
      read: overrides.read ?? false,
    })
    .returning({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
      payload: notifications.payload,
      read: notifications.read,
    });

  return {
    ...notification,
    payload: notification.payload as NotificationPayload,
  };
}

/**
 * Logs in a test user via the API and returns the access token.
 */
export async function loginTestUser(
  app: FastifyInstance,
  email: string,
  password: string
): Promise<{ accessToken: string; cookies: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });

  const body = JSON.parse(response.body);
  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? '');

  return {
    accessToken: body.accessToken,
    cookies,
  };
}
