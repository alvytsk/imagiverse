import type { FastifyInstance } from 'fastify';
import { CreateReportSchema, ResolveReportSchema } from 'imagiverse-shared';
import { authenticate } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import type {
  AdminCommentsQuery,
  AdminPhotosQuery,
  AdminReportsQuery,
  AdminUsersQuery,
  CommentIdParams,
  PhotoIdParams,
  ReportIdParams,
  UserIdParams,
} from './admin.schema';
import {
  adminDeleteComment,
  adminDeletePhoto,
  banUser,
  createReport,
  getAdminStats,
  listCommentsAdmin,
  listPhotosAdmin,
  listReports,
  listUsers,
  resolveReport,
  unbanUser,
} from './admin.service';

function validationError(details: Array<{ field: string; message: string }>) {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details,
    },
  };
}

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /admin/stats ────────────────────────────────────────────────────────
  fastify.get('/admin/stats', {
    preHandler: [authenticate, requireAdmin],
    handler: async (_request, reply) => {
      const stats = await getAdminStats();
      return reply.send(stats);
    },
  });

  // ── GET /admin/users ────────────────────────────────────────────────────────
  fastify.get<{ Querystring: AdminUsersQuery }>('/admin/users', {
    preHandler: [authenticate, requireAdmin],
    handler: async (request, reply) => {
      const { status, cursor, limit } = request.query;
      const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
      const result = await listUsers(
        (status as 'all' | 'active' | 'banned') ?? 'all',
        cursor,
        parsedLimit
      );
      return reply.send(result);
    },
  });

  // ── PATCH /admin/users/:id/ban ──────────────────────────────────────────────
  fastify.patch<{ Params: UserIdParams }>('/admin/users/:id/ban', {
    preHandler: [authenticate, requireAdmin],
    handler: async (request, reply) => {
      const { id } = request.params;

      if (id === request.user!.id) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Cannot ban yourself' },
        });
      }

      const success = await banUser(id);
      if (!success) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'User not found or already banned' },
        });
      }
      return reply.send({ success: true });
    },
  });

  // ── PATCH /admin/users/:id/unban ────────────────────────────────────────────
  fastify.patch<{ Params: UserIdParams }>('/admin/users/:id/unban', {
    preHandler: [authenticate, requireAdmin],
    handler: async (request, reply) => {
      const { id } = request.params;
      const success = await unbanUser(id);
      if (!success) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'User not found or not banned' },
        });
      }
      return reply.send({ success: true });
    },
  });

  // ── GET /admin/photos ───────────────────────────────────────────────────────
  fastify.get<{ Querystring: AdminPhotosQuery }>('/admin/photos', {
    preHandler: [authenticate, requireAdmin],
    handler: async (request, reply) => {
      const { status, cursor, limit } = request.query;
      const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
      const result = await listPhotosAdmin(
        (status as 'all' | 'ready' | 'failed' | 'processing' | 'reported') ?? 'all',
        cursor,
        parsedLimit
      );
      return reply.send(result);
    },
  });

  // ── DELETE /admin/photos/:id ────────────────────────────────────────────────
  fastify.delete<{ Params: PhotoIdParams }>('/admin/photos/:id', {
    preHandler: [authenticate, requireAdmin],
    handler: async (request, reply) => {
      const { id } = request.params;
      const success = await adminDeletePhoto(id);
      if (!success) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Photo not found or already deleted' },
        });
      }
      return reply.status(204).send();
    },
  });

  // ── GET /admin/reports ──────────────────────────────────────────────────────
  fastify.get<{ Querystring: AdminReportsQuery }>('/admin/reports', {
    preHandler: [authenticate, requireAdmin],
    handler: async (request, reply) => {
      const { status, cursor, limit } = request.query;
      const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
      const result = await listReports(
        (status as 'pending' | 'reviewed' | 'dismissed' | 'all') ?? 'pending',
        cursor,
        parsedLimit
      );
      return reply.send(result);
    },
  });

  // ── PATCH /admin/reports/:id ────────────────────────────────────────────────
  fastify.patch<{ Params: ReportIdParams }>('/admin/reports/:id', {
    preHandler: [authenticate, requireAdmin],
    handler: async (request, reply) => {
      const { id } = request.params;
      const result = ResolveReportSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send(
          validationError(
            result.error.issues.map((i: { path: (string | number)[]; message: string }) => ({
              field: i.path.join('.'),
              message: i.message,
            }))
          )
        );
      }

      const success = await resolveReport(id, request.user!.id, result.data.status);
      if (!success) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Report not found or already resolved' },
        });
      }
      return reply.send({ success: true });
    },
  });

  // ── GET /admin/comments ─────────────────────────────────────────────────────
  fastify.get<{ Querystring: AdminCommentsQuery }>('/admin/comments', {
    preHandler: [authenticate, requireAdmin],
    handler: async (request, reply) => {
      const { flagged, cursor, limit } = request.query;
      const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
      const flaggedOnly = flagged === 'true';
      const result = await listCommentsAdmin(flaggedOnly, cursor, parsedLimit);
      return reply.send(result);
    },
  });

  // ── DELETE /admin/comments/:id ──────────────────────────────────────────────
  fastify.delete<{ Params: CommentIdParams }>('/admin/comments/:id', {
    preHandler: [authenticate, requireAdmin],
    handler: async (request, reply) => {
      const { id } = request.params;
      const success = await adminDeleteComment(id);
      if (!success) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Comment not found' },
        });
      }
      return reply.status(204).send();
    },
  });

  // ── POST /photos/:id/report (user-facing, not admin-only) ──────────────────
  fastify.post<{ Params: PhotoIdParams }>('/photos/:id/report', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const { id: photoId } = request.params;
      const userId = request.user!.id;

      const result = CreateReportSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send(
          validationError(
            result.error.issues.map((i: { path: (string | number)[]; message: string }) => ({
              field: i.path.join('.'),
              message: i.message,
            }))
          )
        );
      }

      const report = await createReport(photoId, userId, result.data.reason);

      if (report === 'photo_not_found') {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Photo not found' },
        });
      }
      if (report === 'own_photo') {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Cannot report your own photo' },
        });
      }
      if (report === 'already_reported') {
        return reply.status(409).send({
          error: { code: 'CONFLICT', message: 'You have already reported this photo' },
        });
      }

      return reply.status(201).send({ id: report.id });
    },
  });
}
