import { eq } from 'drizzle-orm';
import { photos } from '../../db/schema/index';
import { setupIntegration, truncateAllTables } from '../../test-helpers/integration-setup';
import {
  createTestLike,
  createTestPhoto,
  createTestUser,
  loginTestUser,
} from '../../test-helpers/test-factories';

// Mock S3 (presigned URLs in photo responses)
vi.mock('../../plugins/s3', () => ({
  uploadObject: vi.fn().mockResolvedValue(undefined),
  getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://fake-s3.example.com/presigned'),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  S3Keys: {
    original: (userId: string, photoId: string, ext: string) => `originals/${userId}/${photoId}.${ext}`,
    thumbSmall: (photoId: string) => `thumbs/${photoId}/small.webp`,
    thumbMedium: (photoId: string) => `thumbs/${photoId}/medium.webp`,
    thumbLarge: (photoId: string) => `thumbs/${photoId}/large.webp`,
    avatar: (userId: string) => `avatars/${userId}/avatar.webp`,
  },
  ensureBucketExists: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../jobs/queue', () => ({
  thumbnailQueue: { add: vi.fn().mockResolvedValue(undefined) },
  THUMBNAIL_QUEUE_NAME: 'generate-thumbnails',
  feedScoreQueue: { add: vi.fn().mockResolvedValue(undefined) },
  FEED_SCORE_QUEUE_NAME: 'feed-score-recalc',
  bullConnection: {},
}));

// Mock feed cache invalidation (it depends on redis.keys which may behave differently)
vi.mock('../../jobs/feed-score.processor', () => ({
  invalidateFeedCache: vi.fn().mockResolvedValue(undefined),
  recalculateAllFeedScores: vi.fn().mockResolvedValue(undefined),
  createFeedScoreWorker: vi.fn(),
}));

const ctx = setupIntegration();

beforeEach(async () => {
  await truncateAllTables(ctx.db);
  await ctx.redis.flushall();
});

describe('POST /api/photos/:photoId/like', () => {
  it('should like a photo and increment like count', async () => {
    const owner = await createTestUser(ctx.db);
    const liker = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);
    const { accessToken } = await loginTestUser(ctx.app, liker.email, liker.password);

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/like`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(201);

    // Verify like count was incremented
    const [updated] = await ctx.db
      .select({ likeCount: photos.likeCount })
      .from(photos)
      .where(eq(photos.id, photo.id));
    expect(updated.likeCount).toBe(1);
  });

  it('should return 409 for duplicate like', async () => {
    const owner = await createTestUser(ctx.db);
    const liker = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);
    const { accessToken } = await loginTestUser(ctx.app, liker.email, liker.password);

    // First like
    await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/like`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // Duplicate like
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/like`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(409);
  });

  it('should return 404 for nonexistent photo', async () => {
    const user = await createTestUser(ctx.db);
    const { accessToken } = await loginTestUser(ctx.app, user.email, user.password);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/photos/00000000-0000-0000-0000-000000000000/like',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('should return 401 without auth', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/photos/00000000-0000-0000-0000-000000000000/like',
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /api/photos/:photoId/like', () => {
  it('should unlike a photo and decrement like count', async () => {
    const owner = await createTestUser(ctx.db);
    const liker = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);

    // Create like directly in DB
    await createTestLike(ctx.db, liker.id, photo.id);

    const { accessToken } = await loginTestUser(ctx.app, liker.email, liker.password);

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/photos/${photo.id}/like`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(204);

    // Verify like count was decremented
    const [updated] = await ctx.db
      .select({ likeCount: photos.likeCount })
      .from(photos)
      .where(eq(photos.id, photo.id));
    expect(updated.likeCount).toBe(0);
  });

  it('should return 404 when not liked', async () => {
    const owner = await createTestUser(ctx.db);
    const user = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);
    const { accessToken } = await loginTestUser(ctx.app, user.email, user.password);

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/photos/${photo.id}/like`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
