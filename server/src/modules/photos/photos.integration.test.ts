import { setupIntegration, truncateAllTables } from '../../test-helpers/integration-setup';
import { createTestPhoto, createTestUser, loginTestUser } from '../../test-helpers/test-factories';

// Mock S3 operations — integration tests don't need real object storage
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

// Mock BullMQ thumbnail queue
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

describe('GET /api/photos/:id', () => {
  it('should return a photo by id', async () => {
    const user = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, user.id);

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/photos/${photo.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(photo.id);
    expect(body.userId).toBe(user.id);
  });

  it('should return 404 for nonexistent photo', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/photos/00000000-0000-0000-0000-000000000000',
    });

    expect(res.statusCode).toBe(404);
  });

  it('should return 404 for deleted photo', async () => {
    const user = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, user.id, { status: 'deleted' });

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/photos/${photo.id}`,
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/photos/:id', () => {
  it('should update caption', async () => {
    const user = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, user.id);
    const { accessToken } = await loginTestUser(ctx.app, user.email, user.password);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/photos/${photo.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { caption: 'Updated caption' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.caption).toBe('Updated caption');
  });

  it('should return 401 without auth', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/photos/00000000-0000-0000-0000-000000000000',
      payload: { caption: 'test' },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /api/photos/:id', () => {
  it('should soft-delete a photo', async () => {
    const user = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, user.id);
    const { accessToken } = await loginTestUser(ctx.app, user.email, user.password);

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/photos/${photo.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(204);

    // Verify photo is no longer returned by GET
    const getRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/photos/${photo.id}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});
