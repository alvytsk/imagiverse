/**
 * Route-level tests for the notifications endpoints.
 *
 * The entire notifications.service module is mocked so these tests exercise only
 * the HTTP layer (request parsing, status codes, response shapes, auth handling)
 * without touching a real database or Redis.
 */

import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach } from 'vitest';

// ── Module mocks (hoisted before any imports) ────────────────────────────────

vi.mock('../../db/index', () => ({ db: {} }));

const mockService = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock('./notifications.service', () => mockService);

import { notificationsRoutes } from './notifications.routes';

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateAuthToken(userId = 'user-uuid-1') {
  return jwt.sign({ id: userId, role: 'user' }, process.env.JWT_SECRET!, { expiresIn: '15m' });
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(notificationsRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

function setupDefaultMocks() {
  mockService.listNotifications.mockResolvedValue({
    data: [],
    pagination: { nextCursor: null, hasMore: false },
  });
  mockService.getUnreadCount.mockResolvedValue(5);
  mockService.markAsRead.mockResolvedValue('updated');
  mockService.markAllAsRead.mockResolvedValue(3);
}

// ── GET /api/notifications ───────────────────────────────────────────────────

describe('GET /api/notifications', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with paginated notifications', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [],
      pagination: { nextCursor: null, hasMore: false },
    });
    expect(mockService.listNotifications).toHaveBeenCalledWith('user-uuid-1', undefined, undefined);
  });

  it('passes cursor and limit to service', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/notifications?cursor=abc&limit=10',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(200);
    expect(mockService.listNotifications).toHaveBeenCalledWith('user-uuid-1', 'abc', 10);
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/notifications',
    });

    expect(response.statusCode).toBe(401);
  });
});

// ── GET /api/notifications/unread-count ──────────────────────────────────────

describe('GET /api/notifications/unread-count', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with unread count', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/notifications/unread-count',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ count: 5 });
    expect(mockService.getUnreadCount).toHaveBeenCalledWith('user-uuid-1');
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/notifications/unread-count',
    });

    expect(response.statusCode).toBe(401);
  });
});

// ── PATCH /api/notifications/read-all ────────────────────────────────────────

describe('PATCH /api/notifications/read-all', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with updated count', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/read-all',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ updated: 3 });
    expect(mockService.markAllAsRead).toHaveBeenCalledWith('user-uuid-1');
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/read-all',
    });

    expect(response.statusCode).toBe(401);
  });
});

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────

describe('PATCH /api/notifications/:id/read', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 on successful mark as read', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/notif-uuid-1/read',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(mockService.markAsRead).toHaveBeenCalledWith('notif-uuid-1', 'user-uuid-1');
  });

  it('returns 404 when notification not found', async () => {
    mockService.markAsRead.mockResolvedValue('not_found');

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/nonexistent/read',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/notif-uuid-1/read',
    });

    expect(response.statusCode).toBe(401);
  });
});
