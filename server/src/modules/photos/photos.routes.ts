import multipartPlugin from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, UpdateCaptionSchema } from 'imagiverse-shared';
import sharp from 'sharp';
import { authenticate } from '../../middleware/auth';
import type { PhotoIdParams } from './photos.schema';
import {
  buildPhotoResponse,
  checkUploadRateLimit,
  getPhotoById,
  softDeletePhoto,
  updateCaption,
  uploadPhoto,
} from './photos.service';

function validationError(details: Array<{ field: string; message: string }>) {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details,
    },
  };
}

export async function photoRoutes(fastify: FastifyInstance): Promise<void> {
  // Register multipart support scoped to this plugin
  await fastify.register(multipartPlugin, {
    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
      files: 1,
    },
  });

  // ── POST /photos ─────────────────────────────────────────────────────────
  fastify.post('/photos', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const userId = request.user!.id;

      // Check upload rate limit
      const allowed = await checkUploadRateLimit(userId);
      if (!allowed) {
        return reply.status(429).send({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Upload limit exceeded. Try again later.',
          },
        });
      }

      // Parse multipart data
      const data = await request.file();
      if (!data) {
        return reply
          .status(400)
          .send(validationError([{ field: 'file', message: 'No file uploaded' }]));
      }

      // Validate MIME type from Content-Type header
      const mimeType = data.mimetype;
      if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_FILE_TYPE',
            message: `File type "${mimeType}" is not allowed. Accepted: ${ALLOWED_MIME_TYPES.join(', ')}`,
          },
        });
      }

      // Read file buffer
      const fileBuffer = await data.toBuffer();
      const sizeBytes = fileBuffer.length;

      // Validate magic bytes via sharp metadata
      try {
        const metadata = await sharp(fileBuffer).metadata();
        if (!metadata.format) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_FILE_TYPE',
              message: 'File content does not match a supported image format',
            },
          });
        }
      } catch {
        return reply.status(400).send({
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'Unable to read image file. The file may be corrupt.',
          },
        });
      }

      // Extract caption from multipart fields
      const captionField = data.fields.caption;
      let caption: string | null = null;
      if (captionField && 'value' in captionField && typeof captionField.value === 'string') {
        caption = captionField.value;
      }

      const photo = await uploadPhoto({ userId, fileBuffer, mimeType, sizeBytes, caption });

      return reply.status(201).send({ id: photo.id, status: photo.status });
    },
  });

  // ── GET /photos/:id ──────────────────────────────────────────────────────
  fastify.get<{ Params: PhotoIdParams }>('/photos/:id', {
    handler: async (request, reply) => {
      const { id } = request.params;

      const photo = await getPhotoById(id);
      if (!photo || photo.status === 'deleted') {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Photo not found' },
        });
      }

      const response = await buildPhotoResponse(photo);
      return reply.send(response);
    },
  });

  // ── PATCH /photos/:id ────────────────────────────────────────────────────
  fastify.patch<{ Params: PhotoIdParams }>('/photos/:id', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const { id } = request.params;
      const userId = request.user!.id;

      const result = UpdateCaptionSchema.safeParse(request.body);
      if (!result.success) {
        return reply
          .status(400)
          .send(
            validationError(
              result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
            )
          );
      }

      const updated = await updateCaption(id, userId, result.data.caption ?? null);
      if (!updated) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Photo not found' },
        });
      }

      const response = await buildPhotoResponse(updated);
      return reply.send(response);
    },
  });

  // ── DELETE /photos/:id ───────────────────────────────────────────────────
  fastify.delete<{ Params: PhotoIdParams }>('/photos/:id', {
    preHandler: authenticate,
    handler: async (request, reply) => {
      const { id } = request.params;
      const userId = request.user!.id;

      const deleted = await softDeletePhoto(id, userId);
      if (!deleted) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Photo not found' },
        });
      }

      return reply.status(204).send();
    },
  });
}
