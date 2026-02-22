/**
 * Pure unit tests for auth service functions.
 * No DB or Redis connections are exercised here — only crypto / JWT logic.
 */

// Prevent real Redis connection during import
vi.mock('../../plugins/redis', () => ({
  redis: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
  RedisKeys: { refreshToken: (id: string) => `refresh:${id}` },
  REFRESH_TOKEN_TTL: 604800,
}));

// Prevent real DB connection during import
vi.mock('../../db/index', () => ({ db: {} }));

import {
  ACCESS_EXPIRES_SECONDS,
  buildTokenResponse,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  hashPassword,
  verifyAccessToken,
  verifyRefreshToken,
} from './auth.service';

describe('hashPassword / comparePassword', () => {
  it('creates a bcrypt hash that verifies correctly', async () => {
    const hash = await hashPassword('MyP@ssw0rd!');
    expect(hash).toMatch(/^\$2[ab]?\$/);
    await expect(comparePassword('MyP@ssw0rd!', hash)).resolves.toBe(true);
  });

  it('returns false for an incorrect password', async () => {
    const hash = await hashPassword('correct-horse');
    await expect(comparePassword('wrong-horse', hash)).resolves.toBe(false);
  });
});

describe('generateAccessToken / verifyAccessToken', () => {
  it('creates a token that decodes back to the original payload', () => {
    const token = generateAccessToken({ id: 'user-123', role: 'user' });
    expect(typeof token).toBe('string');
    const payload = verifyAccessToken(token);
    expect(payload.id).toBe('user-123');
    expect(payload.role).toBe('user');
  });

  it('throws on a tampered token', () => {
    const token = generateAccessToken({ id: 'user-123', role: 'user' });
    const tampered = token.slice(0, -4) + 'xxxx';
    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});

describe('generateRefreshToken / verifyRefreshToken', () => {
  it('creates a refresh token that decodes to the user id', () => {
    const token = generateRefreshToken('user-456');
    expect(typeof token).toBe('string');
    const payload = verifyRefreshToken(token);
    expect(payload.id).toBe('user-456');
  });

  it('throws on an invalid refresh token', () => {
    expect(() => verifyRefreshToken('not-a-jwt')).toThrow();
  });
});

describe('buildTokenResponse', () => {
  it('returns the correct shape', () => {
    const response = buildTokenResponse('access-token-xyz');
    expect(response).toEqual({
      accessToken: 'access-token-xyz',
      tokenType: 'Bearer',
      expiresIn: ACCESS_EXPIRES_SECONDS,
    });
  });
});
