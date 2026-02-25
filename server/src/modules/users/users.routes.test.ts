/**
 * Route-level tests for the user endpoints.
 *
 * The users.service module is mocked so these tests exercise only the
 * HTTP layer without touching a real database.
 */

import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../db/index', () => ({ db: {} }));

const mockService = vi.hoisted(() => ({
  searchUsers: vi.fn(),
  normalizeSearchQuery: vi.fn((q: string) => q.toLowerCase()),
  getMyProfile: vi.fn(),
  getPublicProfile: vi.fn(),
  updateProfile: vi.fn(),
  getUserPhotos: vi.fn(),
}));

vi.mock('./users.service', () => mockService);

import { usersRoutes } from './users.routes';

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateAuthToken(userId = TEST_USER_ID) {
  return jwt.sign({ id: userId, role: 'user' }, process.env.JWT_SECRET!, { expiresIn: '15m' });
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(usersRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440001';

const TEST_USER = {
  id: TEST_USER_ID,
  username: 'alexey',
  displayName: 'Alexey Doe',
  city: 'Berlin',
  avatarUrl: null,
  bio: 'Photographer',
  photoCount: 5,
  createdAt: '2025-01-01T00:00:00.000Z',
};

const TEST_ME_PROFILE = {
  ...TEST_USER,
  email: 'alexey@example.com',
  role: 'user',
};

const TEST_PHOTO = {
  id: 'photo-uuid-1',
  userId: TEST_USER_ID,
  caption: 'Sunset',
  status: 'ready',
  thumbnails: { small: 'https://s3/small', medium: 'https://s3/medium', large: 'https://s3/large' },
  width: 1600,
  height: 1200,
  likeCount: 10,
  commentCount: 2,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const TEST_PHOTOS_PAGE = {
  data: [TEST_PHOTO],
  pagination: { nextCursor: null, hasMore: false },
};

function setupDefaultMocks() {
  mockService.searchUsers.mockResolvedValue([TEST_USER]);
  mockService.getMyProfile.mockResolvedValue(TEST_ME_PROFILE);
  mockService.getPublicProfile.mockResolvedValue(TEST_USER);
  mockService.updateProfile.mockResolvedValue(TEST_ME_PROFILE);
  mockService.getUserPhotos.mockResolvedValue(TEST_PHOTOS_PAGE);
}

// ── GET /api/users/me ───────────────────────────────────────────────────────

describe('GET /api/users/me', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with own profile', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(TEST_USER_ID);
    expect(body.email).toBe('alexey@example.com');
    expect(body.username).toBe('alexey');
    expect(body.role).toBe('user');
    expect(body.photoCount).toBe(5);
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/me',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when user not found', async () => {
    mockService.getMyProfile.mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('calls getMyProfile with user id from token', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${generateAuthToken('custom-user-id')}` },
    });

    expect(mockService.getMyProfile).toHaveBeenCalledWith('custom-user-id');
  });
});

// ── PATCH /api/users/me ─────────────────────────────────────────────────────

describe('PATCH /api/users/me', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with updated profile', async () => {
    const updatedProfile = { ...TEST_ME_PROFILE, displayName: 'New Name' };
    mockService.updateProfile.mockResolvedValue(updatedProfile);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { displayName: 'New Name' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.displayName).toBe('New Name');
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      payload: { displayName: 'Test' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 400 when displayName is empty', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { displayName: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when displayName exceeds max length', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { displayName: 'x'.repeat(65) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when bio exceeds max length', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { bio: 'x'.repeat(501) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('allows setting city to null', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { city: null },
    });

    expect(response.statusCode).toBe(200);
    expect(mockService.updateProfile).toHaveBeenCalledWith(TEST_USER_ID, { city: null });
  });

  it('allows setting bio to null', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { bio: null },
    });

    expect(response.statusCode).toBe(200);
    expect(mockService.updateProfile).toHaveBeenCalledWith(TEST_USER_ID, { bio: null });
  });

  it('returns 404 when user not found', async () => {
    mockService.updateProfile.mockResolvedValue(null);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { displayName: 'New Name' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('passes validated input to updateProfile', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { displayName: 'New Name', city: 'Munich', bio: 'Hello world' },
    });

    expect(mockService.updateProfile).toHaveBeenCalledWith(TEST_USER_ID, {
      displayName: 'New Name',
      city: 'Munich',
      bio: 'Hello world',
    });
  });
});

// ── GET /api/users/search ───────────────────────────────────────────────────

describe('GET /api/users/search', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with search results', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/search?q=alexey',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].username).toBe('alexey');
  });

  it('returns 400 when q is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/search',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when q is empty', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/search?q=',
    });

    expect(response.statusCode).toBe(400);
  });

  it('does not require authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/search?q=test',
    });

    expect(response.statusCode).toBe(200);
  });

  it('passes query and limit to service', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/users/search?q=alex&limit=5',
    });

    expect(mockService.searchUsers).toHaveBeenCalledWith('alex', 5);
  });

  it('returns empty results when no match', async () => {
    mockService.searchUsers.mockResolvedValue([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/users/search?q=nonexistent',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(0);
  });
});

// ── GET /api/users/:id ──────────────────────────────────────────────────────

describe('GET /api/users/:id', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with public profile', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/users/${TEST_USER_ID}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(TEST_USER_ID);
    expect(body.username).toBe('alexey');
    expect(body.displayName).toBe('Alexey Doe');
    expect(body.photoCount).toBe(5);
    // Public profile should not include email
    expect(body.email).toBeUndefined();
  });

  it('returns 404 when user does not exist', async () => {
    mockService.getPublicProfile.mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/users/00000000-0000-0000-0000-000000000000',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('does not require authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/users/${TEST_USER_ID}`,
    });

    expect(response.statusCode).toBe(200);
  });

  it('passes user id to service', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    await app.inject({
      method: 'GET',
      url: `/api/users/${userId}`,
    });

    expect(mockService.getPublicProfile).toHaveBeenCalledWith(userId);
  });

  it('returns 400 for empty user id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(mockService.getPublicProfile).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid UUID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/not-a-uuid',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(mockService.getPublicProfile).not.toHaveBeenCalled();
  });
});

// ── GET /api/users/:id/photos ───────────────────────────────────────────────

describe('GET /api/users/:id/photos', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with paginated photos', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/users/${TEST_USER_ID}/photos`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('photo-uuid-1');
    expect(body.pagination).toBeDefined();
    expect(body.pagination.hasMore).toBe(false);
  });

  it('returns 404 when user does not exist', async () => {
    mockService.getPublicProfile.mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/users/00000000-0000-0000-0000-000000000000/photos',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('does not require authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/users/${TEST_USER_ID}/photos`,
    });

    expect(response.statusCode).toBe(200);
  });

  it('passes cursor and limit to service', async () => {
    await app.inject({
      method: 'GET',
      url: `/api/users/${TEST_USER_ID}/photos?cursor=abc123&limit=10`,
    });

    expect(mockService.getUserPhotos).toHaveBeenCalledWith(TEST_USER_ID, 'abc123', 10, undefined);
  });

  it('passes undefined cursor and limit when not provided', async () => {
    await app.inject({
      method: 'GET',
      url: `/api/users/${TEST_USER_ID}/photos`,
    });

    expect(mockService.getUserPhotos).toHaveBeenCalledWith(
      TEST_USER_ID,
      undefined,
      undefined,
      undefined
    );
  });

  it('returns empty page when user has no photos', async () => {
    mockService.getUserPhotos.mockResolvedValue({
      data: [],
      pagination: { nextCursor: null, hasMore: false },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/users/${TEST_USER_ID}/photos`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(0);
    expect(body.pagination.hasMore).toBe(false);
  });

  it('returns 400 for empty user id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users//photos',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(mockService.getPublicProfile).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid UUID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/not-a-uuid/photos',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(mockService.getPublicProfile).not.toHaveBeenCalled();
  });
});
