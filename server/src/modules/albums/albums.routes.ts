import type { FastifyInstance } from 'fastify';
import { AlbumAddPhotoSchema, CreateAlbumSchema, UpdateAlbumSchema } from 'imagiverse-shared';
import { authenticate } from '../../middleware/auth';
import type { AlbumIdParams, UserIdParams } from './albums.schema';
import {
  addPhotoToAlbum,
  createAlbum,
  deleteAlbum,
  getAlbumById,
  getAlbumPhotos,
  getUserAlbums,
  removePhotoFromAlbum,
  updateAlbum,
} from './albums.service';

function validationError(details: Array<{ field: string; message: string }>) {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details,
    },
  };
}

export async function albumsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /albums ──────────────────────────────────────────────────────────
  fastify.post('/albums', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const result = CreateAlbumSchema.safeParse(request.body);
      if (!result.success) {
        return reply
          .status(400)
          .send(
            validationError(
              result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
            )
          );
      }
      const album = await createAlbum(userId, result.data.name, result.data.description);
      return reply.status(201).send(album);
    },
  });

  // ── GET /users/:id/albums ─────────────────────────────────────────────────
  fastify.get<{ Params: UserIdParams }>('/users/:id/albums', {
    handler: async (request, reply) => {
      const { id } = request.params;
      const albums = await getUserAlbums(id);
      return reply.send({ data: albums });
    },
  });

  // ── GET /albums/:albumId ──────────────────────────────────────────────────
  fastify.get<{ Params: AlbumIdParams }>('/albums/:albumId', {
    handler: async (request, reply) => {
      const { albumId } = request.params;
      const album = await getAlbumById(albumId);
      if (!album) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Album not found' } });
      }
      const photos = await getAlbumPhotos(albumId);
      return reply.send({ album, photos });
    },
  });

  // ── PATCH /albums/:albumId ────────────────────────────────────────────────
  fastify.patch<{ Params: AlbumIdParams }>('/albums/:albumId', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const { albumId } = request.params;
      const userId = request.user!.id;
      const result = UpdateAlbumSchema.safeParse(request.body);
      if (!result.success) {
        return reply
          .status(400)
          .send(
            validationError(
              result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
            )
          );
      }
      const updated = await updateAlbum(albumId, userId, result.data);
      if (!updated) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Album not found' } });
      }
      return reply.send(updated);
    },
  });

  // ── DELETE /albums/:albumId ───────────────────────────────────────────────
  fastify.delete<{ Params: AlbumIdParams }>('/albums/:albumId', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const { albumId } = request.params;
      const userId = request.user!.id;
      const deleted = await deleteAlbum(albumId, userId);
      if (!deleted) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Album not found' } });
      }
      return reply.status(204).send();
    },
  });

  // ── POST /albums/:albumId/photos ──────────────────────────────────────────
  fastify.post<{ Params: AlbumIdParams }>('/albums/:albumId/photos', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const { albumId } = request.params;
      const userId = request.user!.id;
      const result = AlbumAddPhotoSchema.safeParse(request.body);
      if (!result.success) {
        return reply
          .status(400)
          .send(
            validationError(
              result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
            )
          );
      }
      const status = await addPhotoToAlbum(albumId, result.data.photoId, userId);
      if (status === 'not_found') {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Album or photo not found' } });
      }
      if (status === 'forbidden') {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not your album' } });
      }
      if (status === 'already_exists') {
        return reply
          .status(409)
          .send({ error: { code: 'ALREADY_EXISTS', message: 'Photo already in album' } });
      }
      return reply.status(201).send({ success: true });
    },
  });

  // ── DELETE /albums/:albumId/photos/:photoId ───────────────────────────────
  fastify.delete<{ Params: AlbumIdParams & { photoId: string } }>(
    '/albums/:albumId/photos/:photoId',
    {
      preHandler: authenticate,
      handler: async (request, reply) => {
        const { albumId, photoId } = request.params;
        const userId = request.user!.id;
        const removed = await removePhotoFromAlbum(albumId, photoId, userId);
        if (!removed) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
        }
        return reply.status(204).send();
      },
    }
  );
}
