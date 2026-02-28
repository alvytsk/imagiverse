/**
 * Route-level tests for the feed endpoint.
 *
 * The feed.service module is mocked so these tests exercise only the
 * HTTP layer without touching a real database, Redis, or S3.
 */

import Fastify from 'fastify';
import { afterEach, beforeEach } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../db/index', () => ({ db: {} }));
vi.mock('../../plugins/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), keys: vi.fn().mockResolvedValue([]), del: vi.fn() },
  RedisKeys: {},
}));
vi.mock('../../plugins/s3', () => ({
  getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned'),
}));

const mockService = vi.hoisted(() => ({
  getFeed: vi.fn(),
}));

vi.mock('./feed.service', () => mockService);

import { feedRoutes } from './feed.routes';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(feedRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

const TEST_FEED_RESPONSE = {
  data: [
    {
      id: 'photo-1',
      userId: 'user-1',
      caption: 'Sunset',
      thumbnails: {
        small: 'https://s3.example.com/small',
        medium: 'https://s3.example.com/medium',
        large: 'https://s3.example.com/large',
      },
      width: 1920,
      height: 1080,
      likeCount: 50,
      commentCount: 3,
      score: 9.62,
      createdAt: '2025-01-01T00:00:00.000Z',
      author: {
        id: 'user-1',
        username: 'photographer',
        displayName: 'Photo Grapher',
        avatarUrl: null,
      },
    },
  ],
  pagination: { nextCursor: null, hasMore: false },
};

function setupDefaultMocks() {
  mockService.getFeed.mockResolvedValue(TEST_FEED_RESPONSE);
}

// ── GET /api/feed ───────────────────────────────────────────────────────────

describe('GET /api/feed', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with feed data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/feed',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('photo-1');
    expect(body.data[0].author.username).toBe('photographer');
    expect(body.pagination).toBeDefined();
  });

  it('does not require authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/feed',
    });

    expect(response.statusCode).toBe(200);
  });

  it('passes cursor and limit to service', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/feed?cursor=abc123&limit=10',
    });

    expect(mockService.getFeed).toHaveBeenCalledWith('abc123', 10, undefined);
  });

  it('returns empty feed when no photos', async () => {
    mockService.getFeed.mockResolvedValue({
      data: [],
      pagination: { nextCursor: null, hasMore: false },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/feed',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(0);
  });

  it('returns pagination with hasMore and nextCursor', async () => {
    mockService.getFeed.mockResolvedValue({
      data: [TEST_FEED_RESPONSE.data[0]],
      pagination: { nextCursor: 'encoded-cursor', hasMore: true },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/feed',
    });

    const body = response.json();
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.nextCursor).toBe('encoded-cursor');
  });
});
