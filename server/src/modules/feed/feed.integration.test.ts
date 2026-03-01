import { setupIntegration, truncateAllTables } from '../../test-helpers/integration-setup';
import {
  createTestCategory,
  createTestFeedScore,
  createTestPhoto,
  createTestUser,
} from '../../test-helpers/test-factories';

// Mock S3 (presigned URLs in feed items)
vi.mock('../../plugins/s3', () => ({
  uploadObject: vi.fn().mockResolvedValue(undefined),
  getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://fake-s3.example.com/presigned'),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  S3Keys: {
    original: (userId: string, photoId: string, ext: string) =>
      `originals/${userId}/${photoId}.${ext}`,
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

const ctx = setupIntegration();

beforeEach(async () => {
  await truncateAllTables(ctx.db);
  await ctx.redis.flushall();
});

describe('GET /api/feed', () => {
  it('should return empty feed when no photos', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/feed',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.hasMore).toBe(false);
  });

  it('should return feed items sorted by score', async () => {
    const user = await createTestUser(ctx.db);

    // Create photos with different ages (older photos get lower scores)
    const now = new Date();
    const photo1 = await createTestPhoto(ctx.db, user.id);
    const photo2 = await createTestPhoto(ctx.db, user.id);
    const photo3 = await createTestPhoto(ctx.db, user.id);

    // Give photo2 the highest score (most likes, recent)
    await createTestFeedScore(ctx.db, photo1.id, 1, now);
    await createTestFeedScore(ctx.db, photo2.id, 10, now);
    await createTestFeedScore(ctx.db, photo3.id, 5, now);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/feed',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(3);
    // Highest score first
    expect(body.data[0].id).toBe(photo2.id);
    expect(body.data[1].id).toBe(photo3.id);
    expect(body.data[2].id).toBe(photo1.id);
  });

  it('should paginate with cursor', async () => {
    const user = await createTestUser(ctx.db);
    const now = new Date();

    // Create 5 photos with feed scores
    const photoIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const photo = await createTestPhoto(ctx.db, user.id);
      await createTestFeedScore(ctx.db, photo.id, i, now);
      photoIds.push(photo.id);
    }

    // First page
    const page1 = await ctx.app.inject({
      method: 'GET',
      url: '/api/feed?limit=3',
    });

    const body1 = JSON.parse(page1.body);
    expect(body1.data).toHaveLength(3);
    expect(body1.pagination.hasMore).toBe(true);

    // Second page
    const page2 = await ctx.app.inject({
      method: 'GET',
      url: `/api/feed?limit=3&cursor=${body1.pagination.nextCursor}`,
    });

    const body2 = JSON.parse(page2.body);
    expect(body2.data).toHaveLength(2);
    expect(body2.pagination.hasMore).toBe(false);
  });

  it('should not include non-ready photos', async () => {
    const user = await createTestUser(ctx.db);
    const readyPhoto = await createTestPhoto(ctx.db, user.id, { status: 'ready' });
    const processingPhoto = await createTestPhoto(ctx.db, user.id, { status: 'processing' });

    await createTestFeedScore(ctx.db, readyPhoto.id, 1, new Date());
    // Don't create feed score for processing photo — it shouldn't appear anyway

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/feed',
    });

    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(readyPhoto.id);
  });

  it('should be publicly accessible (no auth required)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/feed',
    });

    expect(res.statusCode).toBe(200);
  });

  it('should filter by category slug', async () => {
    const user = await createTestUser(ctx.db);
    const landscape = await createTestCategory(ctx.db, {
      name: 'Landscape',
      slug: 'landscape',
      displayOrder: 1,
    });
    const portrait = await createTestCategory(ctx.db, {
      name: 'Portrait',
      slug: 'portrait',
      displayOrder: 2,
    });

    const photo1 = await createTestPhoto(ctx.db, user.id, { categoryId: landscape.id });
    const photo2 = await createTestPhoto(ctx.db, user.id, { categoryId: portrait.id });
    const photo3 = await createTestPhoto(ctx.db, user.id, { categoryId: landscape.id });

    const now = new Date();
    await createTestFeedScore(ctx.db, photo1.id, 5, now);
    await createTestFeedScore(ctx.db, photo2.id, 10, now);
    await createTestFeedScore(ctx.db, photo3.id, 1, now);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/feed?category=landscape',
    });

    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
    const ids = body.data.map((item: { id: string }) => item.id);
    expect(ids).toContain(photo1.id);
    expect(ids).toContain(photo3.id);
    expect(ids).not.toContain(photo2.id);
  });

  it('should return category data in feed items', async () => {
    const user = await createTestUser(ctx.db);
    const landscape = await createTestCategory(ctx.db, {
      name: 'Landscape',
      slug: 'landscape',
      displayOrder: 1,
    });

    const photo = await createTestPhoto(ctx.db, user.id, { categoryId: landscape.id });
    await createTestFeedScore(ctx.db, photo.id, 5, new Date());

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/feed',
    });

    const body = JSON.parse(res.body);
    expect(body.data[0].category).toEqual({
      id: landscape.id,
      name: 'Landscape',
      slug: 'landscape',
    });
  });

  it('should return null category for uncategorized photos', async () => {
    const user = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, user.id);
    await createTestFeedScore(ctx.db, photo.id, 5, new Date());

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/feed',
    });

    const body = JSON.parse(res.body);
    expect(body.data[0].category).toBeNull();
  });

  it('should return empty feed for nonexistent category slug', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/feed?category=nonexistent',
    });

    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.hasMore).toBe(false);
  });
});
