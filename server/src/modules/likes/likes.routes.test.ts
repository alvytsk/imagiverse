/**
 * Route-level tests for the likes endpoints.
 *
 * The entire likes.service module is mocked so these tests exercise only the
 * HTTP layer (request parsing, status codes, response shapes, auth handling)
 * without touching a real database or Redis.
 */

import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach } from 'vitest';

// ── Module mocks (hoisted before any imports) ────────────────────────────────

vi.mock('../../db/index', () => ({ db: {} }));

const mockService = vi.hoisted(() => ({
  getReadyPhoto: vi.fn(),
  likePhoto: vi.fn(),
  unlikePhoto: vi.fn(),
  hasUserLiked: vi.fn(),
}));

vi.mock('./likes.service', () => mockService);

import { likesRoutes } from './likes.routes';

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateAuthToken(userId = 'user-uuid-1') {
  return jwt.sign({ id: userId, role: 'user' }, process.env.JWT_SECRET!, { expiresIn: '15m' });
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(likesRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

function setupDefaultMocks() {
  mockService.getReadyPhoto.mockResolvedValue({ id: 'photo-uuid-1', status: 'ready' });
  mockService.likePhoto.mockResolvedValue({ created: true, duplicate: false });
  mockService.unlikePhoto.mockResolvedValue(true);
}

// ── POST /api/photos/:photoId/like ──────────────────────────────────────────

describe('POST /api/photos/:photoId/like', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 201 on successful like', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/photo-uuid-1/like',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ liked: true });
    expect(mockService.likePhoto).toHaveBeenCalledWith('user-uuid-1', 'photo-uuid-1');
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/photo-uuid-1/like',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when photo does not exist', async () => {
    mockService.getReadyPhoto.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/nonexistent/like',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('returns 409 when already liked', async () => {
    mockService.likePhoto.mockResolvedValue({ created: false, duplicate: true });

    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/photo-uuid-1/like',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('ALREADY_LIKED');
  });
});

// ── DELETE /api/photos/:photoId/like ────────────────────────────────────────

describe('DELETE /api/photos/:photoId/like', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 204 on successful unlike', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/photos/photo-uuid-1/like',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(204);
    expect(mockService.unlikePhoto).toHaveBeenCalledWith('user-uuid-1', 'photo-uuid-1');
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/photos/photo-uuid-1/like',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when photo does not exist', async () => {
    mockService.getReadyPhoto.mockResolvedValue(null);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/photos/nonexistent/like',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when not previously liked', async () => {
    mockService.unlikePhoto.mockResolvedValue(false);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/photos/photo-uuid-1/like',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_LIKED');
  });
});
