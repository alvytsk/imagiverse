import { setupIntegration, truncateAllTables } from '../../test-helpers/integration-setup';
import {
  createTestComment,
  createTestPhoto,
  createTestReport,
  createTestUser,
  loginTestUser,
} from '../../test-helpers/test-factories';

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

// ── Helper: create admin and login ──────────────────────────────────────────

async function createAdminAndLogin() {
  const admin = await createTestUser(ctx.db, { role: 'admin' });
  const { accessToken } = await loginTestUser(ctx.app, admin.email, admin.password);
  return { admin, accessToken };
}

async function createRegularAndLogin() {
  const user = await createTestUser(ctx.db);
  const { accessToken } = await loginTestUser(ctx.app, user.email, user.password);
  return { user, accessToken };
}

// ── Admin auth guard ────────────────────────────────────────────────────────

describe('Admin auth guard', () => {
  it('returns 403 for non-admin users on admin endpoints', async () => {
    const { accessToken } = await createRegularAndLogin();

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('FORBIDDEN');
  });

  it('returns 401 for unauthenticated requests', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/stats' });
    expect(res.statusCode).toBe(401);
  });
});

// ── GET /api/admin/stats ────────────────────────────────────────────────────

describe('GET /api/admin/stats', () => {
  it('returns dashboard stats for admin', async () => {
    const { accessToken } = await createAdminAndLogin();
    const user = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, user.id);
    await createTestComment(ctx.db, user.id, photo.id);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totalUsers).toBeGreaterThanOrEqual(2);
    expect(body.totalPhotos).toBeGreaterThanOrEqual(1);
    expect(body.totalComments).toBeGreaterThanOrEqual(1);
  });
});

// ── Admin user management ───────────────────────────────────────────────────

describe('Admin user management', () => {
  it('lists all users', async () => {
    const { accessToken } = await createAdminAndLogin();
    await createTestUser(ctx.db);
    await createTestUser(ctx.db);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBeGreaterThanOrEqual(3);
  });

  it('bans a user', async () => {
    const { accessToken } = await createAdminAndLogin();
    const user = await createTestUser(ctx.db);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${user.id}/ban`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  it('unbans a banned user', async () => {
    const { accessToken } = await createAdminAndLogin();
    const user = await createTestUser(ctx.db);

    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${user.id}/ban`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${user.id}/unban`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it('prevents admin from banning themselves', async () => {
    const { admin, accessToken } = await createAdminAndLogin();

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${admin.id}/ban`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(400);
  });

  it('filters banned users', async () => {
    const { accessToken } = await createAdminAndLogin();
    const user = await createTestUser(ctx.db);

    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${user.id}/ban`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/admin/users?status=banned',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].bannedAt).not.toBeNull();
  });
});

// ── Admin photo management ──────────────────────────────────────────────────

describe('Admin photo management', () => {
  it('lists photos with status filter', async () => {
    const { accessToken } = await createAdminAndLogin();
    const user = await createTestUser(ctx.db);
    await createTestPhoto(ctx.db, user.id, { status: 'ready' });
    await createTestPhoto(ctx.db, user.id, { status: 'failed' });

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/admin/photos?status=failed',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].status).toBe('failed');
  });

  it('deletes a photo (admin)', async () => {
    const { accessToken } = await createAdminAndLogin();
    const user = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, user.id);

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/admin/photos/${photo.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(204);
  });
});

// ── Photo reporting ─────────────────────────────────────────────────────────

describe('POST /api/photos/:id/report', () => {
  it('creates a report for a photo', async () => {
    const owner = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);
    const { accessToken } = await createRegularAndLogin();

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/report`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { reason: 'Inappropriate content' },
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).id).toBeDefined();
  });

  it('prevents reporting own photo', async () => {
    const { user, accessToken } = await createRegularAndLogin();
    const photo = await createTestPhoto(ctx.db, user.id);

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/report`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { reason: 'Test' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('prevents duplicate reports', async () => {
    const owner = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);
    const { accessToken } = await createRegularAndLogin();

    await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/report`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { reason: 'First report' },
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/report`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { reason: 'Second report' },
    });

    expect(res.statusCode).toBe(409);
  });
});

// ── Admin report management ─────────────────────────────────────────────────

describe('Admin report management', () => {
  it('lists pending reports', async () => {
    const { accessToken } = await createAdminAndLogin();
    const owner = await createTestUser(ctx.db);
    const reporter = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);
    await createTestReport(ctx.db, photo.id, reporter.id);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/admin/reports',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].status).toBe('pending');
  });

  it('resolves a report', async () => {
    const { accessToken } = await createAdminAndLogin();
    const owner = await createTestUser(ctx.db);
    const reporter = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, owner.id);
    const report = await createTestReport(ctx.db, photo.id, reporter.id);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/reports/${report.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: 'reviewed' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });
});

// ── Admin comment management ────────────────────────────────────────────────

describe('Admin comment management', () => {
  it('lists flagged comments', async () => {
    const { accessToken } = await createAdminAndLogin();
    const user = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, user.id);
    await createTestComment(ctx.db, user.id, photo.id, 'normal comment');

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/admin/comments?flagged=true',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(0);
  });

  it('deletes a comment (admin)', async () => {
    const { accessToken } = await createAdminAndLogin();
    const user = await createTestUser(ctx.db);
    const photo = await createTestPhoto(ctx.db, user.id);
    const comment = await createTestComment(ctx.db, user.id, photo.id);

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/admin/comments/${comment.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(204);
  });
});
