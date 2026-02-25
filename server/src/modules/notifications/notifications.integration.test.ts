import jwt from 'jsonwebtoken';
import { setupIntegration, truncateAllTables } from '../../test-helpers/integration-setup';
import {
  createTestNotification,
  createTestPhoto,
  createTestUser,
  loginTestUser,
} from '../../test-helpers/test-factories';

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

// Helper: generate a JWT directly (avoids hitting rate-limited login endpoint)
function generateToken(userId: string) {
  return jwt.sign({ id: userId, role: 'user' }, process.env.JWT_SECRET!, { expiresIn: '15m' });
}

// ── Notification creation on like ────────────────────────────────────────────

describe('Notification on like', () => {
  it('should create a notification for photo owner when liked', async () => {
    const owner = await createTestUser(ctx.db);
    const liker = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);
    const { accessToken: likerToken } = await loginTestUser(ctx.app, liker.email, liker.password);

    await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/like`,
      headers: { authorization: `Bearer ${likerToken}` },
    });

    // Allow fire-and-forget to complete
    await new Promise((r) => setTimeout(r, 100));

    const ownerToken = generateToken(owner.id);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].type).toBe('like');
    expect(body.data[0].payload.actorId).toBe(liker.id);
    expect(body.data[0].payload.photoId).toBe(photo.id);
    expect(body.data[0].read).toBe(false);
  });

  it('should NOT create a self-notification when owner likes own photo', async () => {
    const owner = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);
    const { accessToken } = await loginTestUser(ctx.app, owner.email, owner.password);

    await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/like`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await new Promise((r) => setTimeout(r, 100));

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.json().data).toHaveLength(0);
  });
});

// ── Notification creation on comment ─────────────────────────────────────────

describe('Notification on comment', () => {
  it('should create a notification for photo owner when commented', async () => {
    const owner = await createTestUser(ctx.db);
    const commenter = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);
    const { accessToken: commenterToken } = await loginTestUser(
      ctx.app,
      commenter.email,
      commenter.password
    );

    await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/comments`,
      headers: { authorization: `Bearer ${commenterToken}` },
      payload: { body: 'Nice photo!' },
    });

    await new Promise((r) => setTimeout(r, 100));

    const ownerToken = generateToken(owner.id);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].type).toBe('comment');
    expect(body.data[0].payload.actorId).toBe(commenter.id);
    expect(body.data[0].payload.photoId).toBe(photo.id);
    expect(body.data[0].payload.commentId).toBeDefined();
  });
});

// ── GET /api/notifications ───────────────────────────────────────────────────

describe('GET /api/notifications', () => {
  it('should return paginated notifications newest-first', async () => {
    const user = await createTestUser(ctx.db);

    for (let i = 0; i < 3; i++) {
      await createTestNotification(ctx.db, user.id);
    }

    const token = generateToken(user.id);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications?limit=2',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.nextCursor).toBeTruthy();

    // Second page
    const res2 = await ctx.app.inject({
      method: 'GET',
      url: `/api/notifications?limit=2&cursor=${body.pagination.nextCursor}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res2.json().data).toHaveLength(1);
    expect(res2.json().pagination.hasMore).toBe(false);
  });

  it('should not return notifications belonging to another user', async () => {
    const user1 = await createTestUser(ctx.db);
    const user2 = await createTestUser(ctx.db);

    await createTestNotification(ctx.db, user1.id);
    await createTestNotification(ctx.db, user2.id);

    const token = generateToken(user1.id);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.json().data).toHaveLength(1);
  });
});

// ── GET /api/notifications/unread-count ──────────────────────────────────────

describe('GET /api/notifications/unread-count', () => {
  it('should return count of unread notifications', async () => {
    const user = await createTestUser(ctx.db);

    await createTestNotification(ctx.db, user.id, { read: false });
    await createTestNotification(ctx.db, user.id, { read: false });
    await createTestNotification(ctx.db, user.id, { read: true });

    const token = generateToken(user.id);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications/unread-count',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ count: 2 });
  });
});

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────

describe('PATCH /api/notifications/:id/read', () => {
  it('should mark a notification as read', async () => {
    const user = await createTestUser(ctx.db);
    const notification = await createTestNotification(ctx.db, user.id);

    const token = generateToken(user.id);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/notifications/${notification.id}/read`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });

    // Verify unread count went down
    const countRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications/unread-count',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(countRes.json().count).toBe(0);
  });

  it('should return 404 for another user notification', async () => {
    const user1 = await createTestUser(ctx.db);
    const user2 = await createTestUser(ctx.db);
    const notification = await createTestNotification(ctx.db, user1.id);

    const token = generateToken(user2.id);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/notifications/${notification.id}/read`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ── PATCH /api/notifications/read-all ────────────────────────────────────────

describe('PATCH /api/notifications/read-all', () => {
  it('should mark all unread notifications as read', async () => {
    const user = await createTestUser(ctx.db);

    await createTestNotification(ctx.db, user.id, { read: false });
    await createTestNotification(ctx.db, user.id, { read: false });
    await createTestNotification(ctx.db, user.id, { read: true });

    const token = generateToken(user.id);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/notifications/read-all',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ updated: 2 });

    // Verify all are now read
    const countRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications/unread-count',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(countRes.json().count).toBe(0);
  });
});
