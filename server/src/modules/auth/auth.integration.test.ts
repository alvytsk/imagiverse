import { setupIntegration, truncateAllTables } from '../../test-helpers/integration-setup';
import { createTestUser, loginTestUser } from '../../test-helpers/test-factories';

const ctx = setupIntegration();

beforeEach(async () => {
  await truncateAllTables(ctx.db);
  await ctx.redis.flushall();
});

describe('POST /api/auth/register', () => {
  it('should register a new user and return tokens', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'test@example.com',
        username: 'testuser',
        displayName: 'Test User',
        password: 'SecurePass1!',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeDefined();
    expect(body.tokenType).toBe('Bearer');
    expect(body.user.email).toBe('test@example.com');
    expect(body.user.username).toBe('testuser');

    // Should set refresh token cookie
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
    expect(cookieStr).toContain('refreshToken=');
  });

  it('should return 409 for duplicate email', async () => {
    await createTestUser(ctx.db, { email: 'dup@example.com', username: 'user1' });

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'dup@example.com',
        username: 'user2',
        displayName: 'User Two',
        password: 'SecurePass1!',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('CONFLICT');
  });

  it('should return 400 for invalid input', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'not-an-email', username: '', displayName: '', password: 'short' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/login', () => {
  it('should login with valid credentials', async () => {
    const user = await createTestUser(ctx.db, {
      email: 'login@example.com',
      username: 'loginuser',
      password: 'SecurePass1!',
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'login@example.com', password: 'SecurePass1!' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeDefined();
    expect(body.user.id).toBe(user.id);
  });

  it('should return 401 for wrong password', async () => {
    await createTestUser(ctx.db, { email: 'wrong@example.com', username: 'wronguser' });

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'wrong@example.com', password: 'WrongPassword1!' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('should return 401 for nonexistent user', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ghost@example.com', password: 'Password1!' },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('should refresh tokens with valid cookie', async () => {
    const user = await createTestUser(ctx.db, {
      email: 'refresh@example.com',
      username: 'refreshuser',
    });

    const { cookies } = await loginTestUser(ctx.app, 'refresh@example.com', user.password);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: cookies },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeDefined();
  });

  it('should return 401 without cookie', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('should clear refresh token', async () => {
    const user = await createTestUser(ctx.db, {
      email: 'logout@example.com',
      username: 'logoutuser',
    });

    const { cookies } = await loginTestUser(ctx.app, 'logout@example.com', user.password);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: cookies },
    });

    expect(res.statusCode).toBe(204);

    // Attempting to refresh after logout should fail
    const refreshRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: cookies },
    });

    expect(refreshRes.statusCode).toBe(401);
  });

  it('should succeed even without cookie', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    });

    expect(res.statusCode).toBe(204);
  });
});
