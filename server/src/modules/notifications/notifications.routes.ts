import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth';
import type { NotificationIdParams, PaginationQuery } from './notifications.schema';
import {
  getUnreadCount,
  listNotifications,
  markAllAsRead,
  markAsRead,
} from './notifications.service';

export async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /notifications ──────────────────────────────────────────────────────
  fastify.get<{ Querystring: PaginationQuery }>('/notifications', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { cursor, limit } = request.query;

      const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
      const response = await listNotifications(userId, cursor, parsedLimit);
      return reply.send(response);
    },
  });

  // ── GET /notifications/unread-count ─────────────────────────────────────────
  fastify.get('/notifications/unread-count', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const count = await getUnreadCount(userId);
      return reply.send({ count });
    },
  });

  // ── PATCH /notifications/read-all ───────────────────────────────────────────
  // Register BEFORE the parameterized route to avoid `:id` matching "read-all"
  fastify.patch('/notifications/read-all', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const count = await markAllAsRead(userId);
      return reply.send({ updated: count });
    },
  });

  // ── PATCH /notifications/:id/read ───────────────────────────────────────────
  fastify.patch<{ Params: NotificationIdParams }>('/notifications/:id/read', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const { id } = request.params;
      const userId = request.user!.id;

      const result = await markAsRead(id, userId);

      if (result === 'not_found') {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Notification not found' },
        });
      }

      return reply.send({ success: true });
    },
  });
}
