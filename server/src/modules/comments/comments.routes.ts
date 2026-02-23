import type { FastifyInstance } from 'fastify';
import { CreateCommentSchema } from 'imagiverse-shared';
import { authenticate } from '../../middleware/auth';
import type { CommentIdParams, PaginationQuery, PhotoIdParams } from './comments.schema';
import { createComment, deleteComment, getReadyPhoto, listComments } from './comments.service';

function validationError(details: Array<{ field: string; message: string }>) {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details,
    },
  };
}

export async function commentsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /photos/:photoId/comments ────────────────────────────────────────
  fastify.post<{ Params: PhotoIdParams }>('/photos/:photoId/comments', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const { photoId } = request.params;
      const userId = request.user!.id;

      const photo = await getReadyPhoto(photoId);
      if (!photo) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Photo not found' },
        });
      }

      const result = CreateCommentSchema.safeParse(request.body);
      if (!result.success) {
        return reply
          .status(400)
          .send(
            validationError(
              result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
            )
          );
      }

      const comment = await createComment(userId, photoId, result.data.body);
      return reply.status(201).send(comment);
    },
  });

  // ── GET /photos/:photoId/comments ─────────────────────────────────────────
  fastify.get<{ Params: PhotoIdParams; Querystring: PaginationQuery }>(
    '/photos/:photoId/comments',
    {
      handler: async (request, reply) => {
        const { photoId } = request.params;
        const { cursor, limit } = request.query;

        const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
        const response = await listComments(photoId, cursor, parsedLimit);
        return reply.send(response);
      },
    }
  );

  // ── DELETE /comments/:id ──────────────────────────────────────────────────
  fastify.delete<{ Params: CommentIdParams }>('/comments/:id', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const { id } = request.params;
      const userId = request.user!.id;

      const result = await deleteComment(id, userId);

      if (result === 'not_found') {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Comment not found' },
        });
      }

      if (result === 'forbidden') {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'You can only delete your own comments' },
        });
      }

      return reply.status(204).send();
    },
  });
}
