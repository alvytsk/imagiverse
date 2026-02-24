import { setupIntegration, truncateAllTables } from '../../test-helpers/integration-setup';
import {
  createTestComment,
  createTestPhoto,
  createTestUser,
  loginTestUser,
} from '../../test-helpers/test-factories';

// Mock S3 (presigned URLs)
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

const ctx = setupIntegration();

beforeEach(async () => {
  await truncateAllTables(ctx.db);
  await ctx.redis.flushall();
});

describe('POST /api/photos/:photoId/comments', () => {
  it('should create a comment', async () => {
    const owner = await createTestUser(ctx.db);
    const commenter = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);
    const { accessToken } = await loginTestUser(ctx.app, commenter.email, commenter.password);

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/comments`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { body: 'Great photo!' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.body).toBe('Great photo!');
    expect(body.userId).toBe(commenter.id);
    expect(body.photoId).toBe(photo.id);
  });

  it('should return 401 without auth', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/photos/00000000-0000-0000-0000-000000000000/comments',
      payload: { body: 'test' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('should return 404 for nonexistent photo', async () => {
    const user = await createTestUser(ctx.db);
    const { accessToken } = await loginTestUser(ctx.app, user.email, user.password);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/photos/00000000-0000-0000-0000-000000000000/comments',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { body: 'test comment' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('should sanitize HTML in comment body', async () => {
    const owner = await createTestUser(ctx.db);
    const commenter = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);
    const { accessToken } = await loginTestUser(ctx.app, commenter.email, commenter.password);

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/comments`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { body: '<script>alert("xss")</script>Nice photo' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.body).not.toContain('<script>');
    expect(body.body).toContain('Nice photo');
  });
});

describe('GET /api/photos/:photoId/comments', () => {
  it('should list comments with pagination', async () => {
    const owner = await createTestUser(ctx.db);
    const commenter = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);

    // Create 3 comments
    for (let i = 0; i < 3; i++) {
      await createTestComment(ctx.db, commenter.id, photo.id, `Comment ${i}`);
    }

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/photos/${photo.id}/comments`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(3);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.nextCursor).toBeNull();
  });

  it('should respect limit parameter', async () => {
    const owner = await createTestUser(ctx.db);
    const commenter = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);

    for (let i = 0; i < 5; i++) {
      await createTestComment(ctx.db, commenter.id, photo.id, `Comment ${i}`);
    }

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/photos/${photo.id}/comments?limit=2`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.nextCursor).toBeDefined();
  });

  it('should paginate with cursor', async () => {
    const owner = await createTestUser(ctx.db);
    const commenter = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);

    for (let i = 0; i < 5; i++) {
      await createTestComment(ctx.db, commenter.id, photo.id, `Comment ${i}`);
    }

    // First page
    const page1 = await ctx.app.inject({
      method: 'GET',
      url: `/api/photos/${photo.id}/comments?limit=3`,
    });

    const body1 = JSON.parse(page1.body);
    expect(body1.data).toHaveLength(3);

    // Second page
    const page2 = await ctx.app.inject({
      method: 'GET',
      url: `/api/photos/${photo.id}/comments?limit=3&cursor=${body1.pagination.nextCursor}`,
    });

    const body2 = JSON.parse(page2.body);
    expect(body2.data).toHaveLength(2);
    expect(body2.pagination.hasMore).toBe(false);
  });
});

describe('DELETE /api/comments/:id', () => {
  it('should delete own comment', async () => {
    const owner = await createTestUser(ctx.db);
    const commenter = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);
    const comment = await createTestComment(ctx.db, commenter.id, photo.id, 'To delete');
    const { accessToken } = await loginTestUser(ctx.app, commenter.email, commenter.password);

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/comments/${comment.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(204);
  });

  it('should return 403 when deleting another user comment', async () => {
    const owner = await createTestUser(ctx.db);
    const commenter = await createTestUser(ctx.db);
    const otherUser = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);
    const comment = await createTestComment(ctx.db, commenter.id, photo.id, 'Not yours');
    const { accessToken } = await loginTestUser(ctx.app, otherUser.email, otherUser.password);

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/comments/${comment.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(403);
  });
});
