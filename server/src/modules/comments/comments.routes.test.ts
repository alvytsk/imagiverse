/**
 * Route-level tests for the comments endpoints.
 *
 * The entire comments.service module is mocked so these tests exercise only the
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
  createComment: vi.fn(),
  listComments: vi.fn(),
  getCommentById: vi.fn(),
  deleteComment: vi.fn(),
  sanitizeCommentBody: vi.fn((t: string) => t),
}));

vi.mock('./comments.service', () => mockService);

import { commentsRoutes } from './comments.routes';

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateAuthToken(userId = 'user-uuid-1') {
  return jwt.sign({ id: userId, role: 'user' }, process.env.JWT_SECRET!, { expiresIn: '15m' });
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(commentsRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

const TEST_COMMENT = {
  id: 'comment-uuid-1',
  photoId: 'photo-uuid-1',
  userId: 'user-uuid-1',
  username: 'testuser',
  displayName: 'Test User',
  body: 'Great photo!',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const TEST_COMMENTS_PAGE = {
  data: [TEST_COMMENT],
  pagination: { nextCursor: null, hasMore: false },
};

function setupDefaultMocks() {
  mockService.getReadyPhoto.mockResolvedValue({ id: 'photo-uuid-1', status: 'ready' });
  mockService.createComment.mockResolvedValue(TEST_COMMENT);
  mockService.listComments.mockResolvedValue(TEST_COMMENTS_PAGE);
  mockService.deleteComment.mockResolvedValue('deleted');
}

// ── POST /api/photos/:photoId/comments ──────────────────────────────────────

describe('POST /api/photos/:photoId/comments', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 201 with comment on success', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/photo-uuid-1/comments',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { body: 'Great photo!' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.id).toBe('comment-uuid-1');
    expect(body.body).toBe('Great photo!');
    expect(mockService.createComment).toHaveBeenCalledWith(
      'user-uuid-1',
      'photo-uuid-1',
      'Great photo!'
    );
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/photo-uuid-1/comments',
      payload: { body: 'Nice!' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when photo does not exist', async () => {
    mockService.getReadyPhoto.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/nonexistent/comments',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { body: 'Nice!' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when body is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/photo-uuid-1/comments',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when body is empty', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/photo-uuid-1/comments',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { body: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when body exceeds max length', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/photos/photo-uuid-1/comments',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { body: 'x'.repeat(2001) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });
});

// ── GET /api/photos/:photoId/comments ───────────────────────────────────────

describe('GET /api/photos/:photoId/comments', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with paginated comments', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/photos/photo-uuid-1/comments',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.hasMore).toBe(false);
  });

  it('does not require authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/photos/photo-uuid-1/comments',
    });

    expect(response.statusCode).toBe(200);
  });

  it('passes cursor and limit to service', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/photos/photo-uuid-1/comments?cursor=abc123&limit=10',
    });

    expect(mockService.listComments).toHaveBeenCalledWith('photo-uuid-1', 'abc123', 10);
  });
});

// ── DELETE /api/comments/:id ────────────────────────────────────────────────

describe('DELETE /api/comments/:id', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 204 on successful deletion', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/comments/comment-uuid-1',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(204);
    expect(mockService.deleteComment).toHaveBeenCalledWith('comment-uuid-1', 'user-uuid-1');
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/comments/comment-uuid-1',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when comment does not exist', async () => {
    mockService.deleteComment.mockResolvedValue('not_found');

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/comments/nonexistent',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it("returns 403 when deleting another user's comment", async () => {
    mockService.deleteComment.mockResolvedValue('forbidden');

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/comments/comment-uuid-1',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });
});
