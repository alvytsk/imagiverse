import { setupIntegration, truncateAllTables } from '../../test-helpers/integration-setup';
import { createTestPhoto, createTestUser, loginTestUser } from '../../test-helpers/test-factories';

// Mock S3 (presigned URLs in photo responses)
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

describe('GET /api/users/me', () => {
  it('should return the authenticated user profile', async () => {
    const user = await createTestUser(ctx.db, {
      email: 'me@example.com',
      username: 'meuser',
      displayName: 'Me User',
    });
    const { accessToken } = await loginTestUser(ctx.app, user.email, user.password);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(user.id);
    expect(body.email).toBe('me@example.com');
    expect(body.username).toBe('meuser');
    expect(body.photoCount).toBe(0);
  });

  it('should return 401 without auth', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/users/me',
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /api/users/me', () => {
  it('should update display name', async () => {
    const user = await createTestUser(ctx.db);
    const { accessToken } = await loginTestUser(ctx.app, user.email, user.password);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { displayName: 'New Name' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.displayName).toBe('New Name');
  });

  it('should update city and bio', async () => {
    const user = await createTestUser(ctx.db);
    const { accessToken } = await loginTestUser(ctx.app, user.email, user.password);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { city: 'New York', bio: 'Hello world' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.city).toBe('New York');
    expect(body.bio).toBe('Hello world');
  });

  it('should allow setting city and bio to null', async () => {
    const user = await createTestUser(ctx.db, { city: 'Old City', bio: 'Old bio' });
    const { accessToken } = await loginTestUser(ctx.app, user.email, user.password);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { city: null, bio: null },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.city).toBeNull();
    expect(body.bio).toBeNull();
  });
});

describe('GET /api/users/search', () => {
  it('should search users by display name', async () => {
    await createTestUser(ctx.db, { displayName: 'Alice Johnson', username: 'alice' });
    await createTestUser(ctx.db, { displayName: 'Bob Smith', username: 'bob' });

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/users/search?q=alice',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body.some((u: { username: string }) => u.username === 'alice')).toBe(true);
  });

  it('should return 400 without q parameter', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/users/search',
    });

    expect(res.statusCode).toBe(400);
  });

  it('should be publicly accessible', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/users/search?q=test',
    });

    // Even if empty result, should not be 401
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /api/users/:id', () => {
  it('should return a public user profile', async () => {
    const user = await createTestUser(ctx.db, {
      displayName: 'Public User',
      username: 'publicuser',
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/users/${user.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(user.id);
    expect(body.username).toBe('publicuser');
    // Public profile should NOT include email
    expect(body.email).toBeUndefined();
  });

  it('should return 404 for nonexistent user', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/users/00000000-0000-0000-0000-000000000000',
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/users/:id/photos', () => {
  it('should return user photos', async () => {
    const user = await createTestUser(ctx.db);
    await createTestPhoto(ctx.db, user.id);
    await createTestPhoto(ctx.db, user.id);
    await createTestPhoto(ctx.db, user.id, { status: 'processing' }); // should not appear

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/users/${user.id}/photos`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2); // only 'ready' photos
    expect(body.pagination.hasMore).toBe(false);
  });

  it('should paginate user photos', async () => {
    const user = await createTestUser(ctx.db);
    for (let i = 0; i < 5; i++) {
      await createTestPhoto(ctx.db, user.id);
    }

    const page1 = await ctx.app.inject({
      method: 'GET',
      url: `/api/users/${user.id}/photos?limit=3`,
    });

    const body1 = JSON.parse(page1.body);
    expect(body1.data).toHaveLength(3);
    expect(body1.pagination.hasMore).toBe(true);

    const page2 = await ctx.app.inject({
      method: 'GET',
      url: `/api/users/${user.id}/photos?limit=3&cursor=${body1.pagination.nextCursor}`,
    });

    const body2 = JSON.parse(page2.body);
    expect(body2.data).toHaveLength(2);
    expect(body2.pagination.hasMore).toBe(false);
  });

  it('should return 404 for nonexistent user', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/users/00000000-0000-0000-0000-000000000000/photos',
    });

    expect(res.statusCode).toBe(404);
  });
});
