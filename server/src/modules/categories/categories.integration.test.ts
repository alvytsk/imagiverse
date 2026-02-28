import { setupIntegration, truncateAllTables } from '../../test-helpers/integration-setup';
import { createTestCategory } from '../../test-helpers/test-factories';

// Mock S3
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

describe('GET /api/categories', () => {
  it('should return empty list when no categories exist', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/categories',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(0);
  });

  it('should return categories ordered by displayOrder', async () => {
    await createTestCategory(ctx.db, { name: 'Wildlife', slug: 'wildlife', displayOrder: 3 });
    await createTestCategory(ctx.db, { name: 'Landscape', slug: 'landscape', displayOrder: 1 });
    await createTestCategory(ctx.db, { name: 'Portrait', slug: 'portrait', displayOrder: 2 });

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/categories',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(3);
    expect(body.data[0].name).toBe('Landscape');
    expect(body.data[1].name).toBe('Portrait');
    expect(body.data[2].name).toBe('Wildlife');
  });

  it('should return all expected fields', async () => {
    await createTestCategory(ctx.db, { name: 'Nature', slug: 'nature', displayOrder: 1 });

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/categories',
    });

    const body = JSON.parse(res.body);
    const category = body.data[0];
    expect(category).toHaveProperty('id');
    expect(category).toHaveProperty('name', 'Nature');
    expect(category).toHaveProperty('slug', 'nature');
    expect(category).toHaveProperty('displayOrder', 1);
    expect(category).toHaveProperty('iconName');
  });

  it('should be publicly accessible (no auth required)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/categories',
    });

    expect(res.statusCode).toBe(200);
  });
});
