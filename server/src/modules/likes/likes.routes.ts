import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth';
import type { PhotoIdParams } from './likes.schema';
import { getReadyPhoto, likePhoto, unlikePhoto } from './likes.service';

export async function likesRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /photos/:photoId/like ──────────────────────────────────────────────
  fastify.post<{ Params: PhotoIdParams }>('/photos/:photoId/like', {
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

      const result = await likePhoto(userId, photoId);
      if (result.duplicate) {
        return reply.status(409).send({
          error: { code: 'ALREADY_LIKED', message: 'You have already liked this photo' },
        });
      }

      return reply.status(201).send({ liked: true });
    },
  });

  // ── DELETE /photos/:photoId/like ────────────────────────────────────────────
  fastify.delete<{ Params: PhotoIdParams }>('/photos/:photoId/like', {
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

      const removed = await unlikePhoto(userId, photoId);
      if (!removed) {
        return reply.status(404).send({
          error: { code: 'NOT_LIKED', message: 'You have not liked this photo' },
        });
      }

      return reply.status(204).send();
    },
  });
}
