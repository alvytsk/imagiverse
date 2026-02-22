/**
 * Route-level tests for the auth endpoints.
 *
 * The entire auth.service module is mocked so these tests exercise only the
 * HTTP layer (request parsing, status codes, response shapes, cookie handling)
 * without touching a real database or Redis.
 */

import cookiePlugin from '@fastify/cookie';
import rateLimitPlugin from '@fastify/rate-limit';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach } from 'vitest';

// ── Module mocks (hoisted before any imports) ────────────────────────────────

vi.mock('../../plugins/redis', () => ({
  redis: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
  RedisKeys: { refreshToken: (id: string) => `refresh:${id}` },
  REFRESH_TOKEN_TTL: 604800,
}));

vi.mock('../../db/index', () => ({ db: {} }));

// vi.hoisted ensures the object is created before vi.mock factories run (which are hoisted)
const mockService = vi.hoisted(() => ({
  findUserByEmailOrUsername: vi.fn(),
  createUser: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
  storeRefreshToken: vi.fn(),
  getStoredRefreshToken: vi.fn(),
  deleteRefreshToken: vi.fn(),
  buildTokenResponse: vi.fn(),
  ACCESS_EXPIRES_SECONDS: 900,
}));

vi.mock('./auth.service', () => mockService);

import { authRoutes } from './auth.routes';

// ── Test app factory ─────────────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(cookiePlugin);
  await app.register(rateLimitPlugin, {
    max: 10,
    timeWindow: '15 minutes',
    // Use in-memory store (no Redis needed in tests)
  });

  await app.register(authRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

// ── Default mock implementations ─────────────────────────────────────────────

const TEST_USER = {
  id: 'user-uuid-1',
  email: 'alice@example.com',
  username: 'alice',
  displayName: 'Alice',
  role: 'user',
  passwordHash: '$2b$12$hashedpassword',
};

function setupDefaultMocks() {
  mockService.findUserByEmailOrUsername.mockResolvedValue([]);
  mockService.createUser.mockResolvedValue(TEST_USER);
  mockService.findUserByEmail.mockResolvedValue(TEST_USER);
  mockService.findUserById.mockResolvedValue({ id: TEST_USER.id, role: TEST_USER.role });
  mockService.hashPassword.mockResolvedValue('$2b$12$hashedpassword');
  mockService.comparePassword.mockResolvedValue(true);
  mockService.generateAccessToken.mockReturnValue('mock-access-token');
  mockService.generateRefreshToken.mockReturnValue('mock-refresh-token');
  mockService.verifyRefreshToken.mockReturnValue({ id: TEST_USER.id });
  mockService.storeRefreshToken.mockResolvedValue(undefined);
  mockService.getStoredRefreshToken.mockResolvedValue('mock-refresh-token');
  mockService.deleteRefreshToken.mockResolvedValue(undefined);
  mockService.buildTokenResponse.mockReturnValue({
    accessToken: 'mock-access-token',
    tokenType: 'Bearer',
    expiresIn: 900,
  });
}

// ── POST /api/auth/register ──────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('M2.1 — returns 201 with tokens and user on successful registration', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'alice@example.com',
        username: 'alice',
        displayName: 'Alice',
        password: 'Password123!',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.accessToken).toBe('mock-access-token');
    expect(body.tokenType).toBe('Bearer');
    expect(body.user.email).toBe('alice@example.com');
    expect(body.user.username).toBe('alice');
    // Refresh token must be set as an HttpOnly cookie
    const cookies = response.cookies;
    expect(cookies.some((c) => c.name === 'refreshToken' && c.httpOnly)).toBe(true);
  });

  it('returns 400 on invalid input (short password)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'alice@example.com',
        username: 'alice',
        displayName: 'Alice',
        password: 'short',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 when email is already taken', async () => {
    mockService.findUserByEmailOrUsername.mockResolvedValue([
      { id: 'existing-id', email: 'alice@example.com', username: 'other' },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'alice@example.com',
        username: 'alice2',
        displayName: 'Alice',
        password: 'Password123!',
      },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json();
    expect(body.error.code).toBe('CONFLICT');
  });
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('M2.2 — returns 200 with tokens on correct credentials', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'Password123!' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accessToken).toBe('mock-access-token');
    expect(body.user.email).toBe('alice@example.com');
    const cookies = response.cookies;
    expect(cookies.some((c) => c.name === 'refreshToken' && c.httpOnly)).toBe(true);
  });

  it('M2.2 — returns 401 on wrong password', async () => {
    mockService.comparePassword.mockResolvedValue(false);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'WrongPassword!' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 when user does not exist', async () => {
    mockService.findUserByEmail.mockResolvedValue(null);
    mockService.comparePassword.mockResolvedValue(false);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ghost@example.com', password: 'Password123!' },
    });

    expect(response.statusCode).toBe(401);
  });
});

// ── POST /api/auth/refresh ───────────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('M2.3 — returns new access token when refresh token is valid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refreshToken: 'mock-refresh-token' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accessToken).toBe('mock-access-token');
    // Cookie should be rotated
    const cookies = response.cookies;
    expect(cookies.some((c) => c.name === 'refreshToken')).toBe(true);
  });

  it('returns 401 when no refresh cookie is present', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/refresh' });
    expect(response.statusCode).toBe(401);
  });

  it('returns 401 when refresh token does not match stored value', async () => {
    mockService.getStoredRefreshToken.mockResolvedValue('different-stored-token');

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refreshToken: 'mock-refresh-token' },
    });

    expect(response.statusCode).toBe(401);
    // Should have revoked the stored token
    expect(mockService.deleteRefreshToken).toHaveBeenCalledWith(TEST_USER.id);
  });

  it('returns 401 when refresh token JWT is invalid', async () => {
    mockService.verifyRefreshToken.mockImplementation(() => {
      throw new Error('invalid token');
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refreshToken: 'tampered.token.here' },
    });

    expect(response.statusCode).toBe(401);
  });
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('M2.4 — returns 204 and clears cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { refreshToken: 'mock-refresh-token' },
    });

    expect(response.statusCode).toBe(204);
    // Cookie should be cleared (maxAge=0 or expires in the past)
    const cleared = response.cookies.find((c) => c.name === 'refreshToken');
    expect(cleared?.maxAge).toBe(0);
    expect(mockService.deleteRefreshToken).toHaveBeenCalledWith(TEST_USER.id);
  });

  it('M2.4 — returns 204 even without a refresh cookie (graceful)', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(response.statusCode).toBe(204);
    expect(mockService.deleteRefreshToken).not.toHaveBeenCalled();
  });
});

// ── Rate limiting (M2.6) ─────────────────────────────────────────────────────

describe('Rate limiting on auth endpoints', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('M2.6 — returns 429 after 10 requests from the same IP within the window', async () => {
    const payload = {
      email: `user@example.com`,
      username: 'testuser',
      displayName: 'Test User',
      password: 'Password123!',
    };

    // Send 10 allowed requests
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload,
        headers: { 'x-forwarded-for': '1.2.3.4' },
      });
      expect(res.statusCode).not.toBe(429);
    }

    // 11th request should be rate-limited
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload,
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });

    expect(blocked.statusCode).toBe(429);
  });
});

// ── Auth middleware (M2.5) ───────────────────────────────────────────────────

describe('authenticate middleware', () => {
  it('M2.5 — returns 401 when no Authorization header is present', async () => {
    const app = Fastify({ logger: false });

    // Register a protected route
    const { authenticate } = await import('../../middleware/auth');
    app.get('/api/protected', { preHandler: authenticate }, async () => ({ ok: true }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/protected' });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('M2.5 — attaches user to request when a valid token is provided', async () => {
    const app = Fastify({ logger: false });
    const { authenticate } = await import('../../middleware/auth');

    app.get('/api/protected', { preHandler: authenticate }, async (request) => ({
      userId: (request as { user?: { id: string } }).user?.id,
    }));
    await app.ready();

    // Sign a real JWT using the test secret set in test-setup.ts
    const token = jwt.sign({ id: 'user-abc', role: 'user' }, process.env['JWT_SECRET']!, {
      expiresIn: '15m',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBe('user-abc');

    await app.close();
  });
});
