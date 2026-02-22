import type { FastifyInstance } from 'fastify';
import { LoginSchema, RegisterSchema } from 'imagiverse-shared';
import { env } from '../../config/env';
import {
  buildTokenResponse,
  comparePassword,
  createUser,
  deleteRefreshToken,
  findUserByEmail,
  findUserByEmailOrUsername,
  findUserById,
  generateAccessToken,
  generateRefreshToken,
  getStoredRefreshToken,
  hashPassword,
  storeRefreshToken,
  verifyRefreshToken,
} from './auth.service';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
};

const AUTH_RATE_LIMIT = { max: 10, timeWindow: '15 minutes' };

function validationError(issues: Array<{ path: (string | number)[]; message: string }>) {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details: issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    },
  };
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /auth/register ────────────────────────────────────────────────────
  fastify.post('/auth/register', {
    config: { rateLimit: AUTH_RATE_LIMIT },
    handler: async (request, reply) => {
      const result = RegisterSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send(validationError(result.error.issues));
      }

      const { email, username, displayName, password } = result.data;

      const existing = await findUserByEmailOrUsername(email, username);
      if (existing.length > 0) {
        const conflict = existing[0];
        const field = conflict.email === email ? 'email' : 'username';
        return reply.status(409).send({
          error: {
            code: 'CONFLICT',
            message: `${field === 'email' ? 'Email' : 'Username'} already in use`,
            details: [{ field, message: `This ${field} is already taken` }],
          },
        });
      }

      const passwordHash = await hashPassword(password);
      const user = await createUser({ email, username, displayName, passwordHash });

      const accessToken = generateAccessToken({ id: user.id, role: user.role });
      const refreshToken = generateRefreshToken(user.id);

      await storeRefreshToken(user.id, refreshToken);
      reply.setCookie('refreshToken', refreshToken, COOKIE_OPTIONS);

      return reply.status(201).send({
        ...buildTokenResponse(accessToken),
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        },
      });
    },
  });

  // ── POST /auth/login ───────────────────────────────────────────────────────
  fastify.post('/auth/login', {
    config: { rateLimit: AUTH_RATE_LIMIT },
    handler: async (request, reply) => {
      const result = LoginSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send(validationError(result.error.issues));
      }

      const { email, password } = result.data;
      const user = await findUserByEmail(email);

      // Always run a comparison to prevent timing-based user enumeration.
      // Use a dummy hash when the user is not found.
      const hash =
        user?.passwordHash ?? '$2b$12$invalidHashPaddingForTimingAttackPrevention0000000000';
      const valid = await comparePassword(password, hash);

      if (!user || !valid) {
        return reply.status(401).send({
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        });
      }

      const accessToken = generateAccessToken({ id: user.id, role: user.role });
      const refreshToken = generateRefreshToken(user.id);

      await storeRefreshToken(user.id, refreshToken);
      reply.setCookie('refreshToken', refreshToken, COOKIE_OPTIONS);

      return reply.send({
        ...buildTokenResponse(accessToken),
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        },
      });
    },
  });

  // ── POST /auth/refresh ─────────────────────────────────────────────────────
  fastify.post('/auth/refresh', {
    config: { rateLimit: AUTH_RATE_LIMIT },
    handler: async (request, reply) => {
      const token = request.cookies.refreshToken;
      if (!token) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'No refresh token provided' },
        });
      }

      let payload: { id: string };
      try {
        payload = verifyRefreshToken(token);
      } catch {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token' },
        });
      }

      const stored = await getStoredRefreshToken(payload.id);
      if (stored !== token) {
        // Token doesn't match what we stored — possible reuse attack; revoke immediately.
        await deleteRefreshToken(payload.id);
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Refresh token has been revoked' },
        });
      }

      const user = await findUserById(payload.id);
      if (!user) {
        await deleteRefreshToken(payload.id);
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      // Rotate refresh token (security best practice)
      const newAccessToken = generateAccessToken({ id: user.id, role: user.role });
      const newRefreshToken = generateRefreshToken(user.id);

      await storeRefreshToken(user.id, newRefreshToken);
      reply.setCookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);

      return reply.send(buildTokenResponse(newAccessToken));
    },
  });

  // ── POST /auth/logout ──────────────────────────────────────────────────────
  fastify.post('/auth/logout', {
    handler: async (request, reply) => {
      const token = request.cookies.refreshToken;

      if (token) {
        try {
          const payload = verifyRefreshToken(token);
          await deleteRefreshToken(payload.id);
        } catch {
          // Token is already invalid/expired — clear the cookie anyway.
        }
      }

      reply.clearCookie('refreshToken', { path: '/api/auth' });
      return reply.status(204).send();
    },
  });
}
