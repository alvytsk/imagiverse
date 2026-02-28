import type { FastifyInstance } from 'fastify';
import { tryParseAuth } from '../../middleware/auth';
import type { FeedQuery } from './feed.schema';
import { getFeed } from './feed.service';

export async function feedRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /feed ─────────────────────────────────────────────────────────────
  fastify.get<{ Querystring: FeedQuery }>('/feed', {
    handler: async (request, reply) => {
      const { cursor, limit } = request.query;
      const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
      const authUser = tryParseAuth(request);
      const result = await getFeed(cursor, parsedLimit, authUser?.id);
      return reply.send(result);
    },
  });
}
