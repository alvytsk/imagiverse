import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthUser {
  id: string;
  role: string;
}

// Augment Fastify request so `request.user` is typed throughout the server
declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | undefined;
  }
}

/**
 * Fastify preHandler middleware that verifies the JWT access token from the
 * `Authorization: Bearer <token>` header and attaches the decoded user to
 * `request.user`.
 *
 * Usage:
 *   fastify.get('/protected', { preHandler: authenticate }, handler)
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
    });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload & AuthUser;
    request.user = { id: payload.id, role: payload.role };
  } catch {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' },
    });
  }
}

/**
 * Tries to extract the authenticated user from the request without sending
 * any response on failure. Useful when auth is optional (e.g. private photos
 * visible only to their author, but public photos visible to everyone).
 */
export function tryParseAuth(request: FastifyRequest): AuthUser | undefined {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return undefined;

  try {
    const payload = jwt.verify(authHeader.slice(7), env.JWT_SECRET) as jwt.JwtPayload & AuthUser;
    request.user = { id: payload.id, role: payload.role };
    return request.user;
  } catch {
    return undefined;
  }
}
