import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Fastify preHandler middleware that requires the authenticated user
 * to have the 'admin' role. Must be used AFTER the `authenticate` middleware.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.user?.role !== 'admin') {
    return reply.status(403).send({
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
  }
}
