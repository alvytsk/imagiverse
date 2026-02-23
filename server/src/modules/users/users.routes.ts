import type { FastifyInstance } from 'fastify';
import { UpdateProfileSchema } from 'imagiverse-shared';
import { authenticate } from '../../middleware/auth';
import type { PaginationQuery, SearchQuery, UserIdParams } from './users.schema';
import {
  getMyProfile,
  getPublicProfile,
  getUserPhotos,
  searchUsers,
  updateProfile,
} from './users.service';

function validationError(details: Array<{ field: string; message: string }>) {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details,
    },
  };
}

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /users/me ─────────────────────────────────────────────────────────
  fastify.get('/users/me', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const profile = await getMyProfile(userId);

      if (!profile) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      return reply.send(profile);
    },
  });

  // ── PATCH /users/me ───────────────────────────────────────────────────────
  fastify.patch('/users/me', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const userId = request.user!.id;

      const result = UpdateProfileSchema.safeParse(request.body);
      if (!result.success) {
        return reply
          .status(400)
          .send(
            validationError(
              result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
            )
          );
      }

      const updated = await updateProfile(userId, result.data);
      if (!updated) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      return reply.send(updated);
    },
  });

  // ── GET /users/search ─────────────────────────────────────────────────────
  fastify.get<{ Querystring: SearchQuery }>('/users/search', {
    handler: async (request, reply) => {
      const { q, limit } = request.query;

      if (!q || q.trim().length === 0) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Search query is required',
            details: [{ field: 'q', message: 'Query parameter "q" is required' }],
          },
        });
      }

      const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
      const results = await searchUsers(q, parsedLimit);
      return reply.send({ data: results });
    },
  });

  // ── GET /users/:id ────────────────────────────────────────────────────────
  fastify.get<{ Params: UserIdParams }>('/users/:id', {
    handler: async (request, reply) => {
      const { id } = request.params;
      const profile = await getPublicProfile(id);

      if (!profile) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      return reply.send(profile);
    },
  });

  // ── GET /users/:id/photos ─────────────────────────────────────────────────
  fastify.get<{ Params: UserIdParams; Querystring: PaginationQuery }>('/users/:id/photos', {
    handler: async (request, reply) => {
      const { id } = request.params;
      const { cursor, limit } = request.query;

      // Verify user exists
      const profile = await getPublicProfile(id);
      if (!profile) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
      const result = await getUserPhotos(id, cursor, parsedLimit);
      return reply.send(result);
    },
  });
}
