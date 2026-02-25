import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { PhotoResponse } from 'imagiverse-shared';
import sanitizeHtml from 'sanitize-html';
import { db } from '../../db/index';
import { photos } from '../../db/schema/index';
import { type ThumbnailJobData, thumbnailQueue } from '../../jobs/queue';
import { RedisKeys, redis } from '../../plugins/redis';
import { getPresignedDownloadUrl, S3Keys, uploadObject } from '../../plugins/s3';

// ── Constants ────────────────────────────────────────────────────────────────

const UPLOAD_RATE_LIMIT = 30;
const UPLOAD_RATE_WINDOW = 3600; // 1 hour in seconds
const PRESIGNED_URL_EXPIRY = 3600; // 1 hour

// ── Caption sanitization ─────────────────────────────────────────────────────

export function sanitizeCaption(text: string): string {
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
}

// ── MIME type helpers ────────────────────────────────────────────────────────

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export function mimeToExtension(mime: string): string {
  return MIME_TO_EXT[mime] ?? 'bin';
}

// ── Rate limiting ────────────────────────────────────────────────────────────

export async function checkUploadRateLimit(userId: string): Promise<boolean> {
  const key = RedisKeys.uploadRate(userId);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, UPLOAD_RATE_WINDOW);
  }
  return count <= UPLOAD_RATE_LIMIT;
}

// ── Photo CRUD ───────────────────────────────────────────────────────────────

export async function uploadPhoto({
  userId,
  fileBuffer,
  mimeType,
  sizeBytes,
  caption,
  correlationId,
}: {
  userId: string;
  fileBuffer: Buffer;
  mimeType: string;
  sizeBytes: number;
  caption?: string | null;
  correlationId?: string;
}) {
  const photoId = crypto.randomUUID();
  const ext = mimeToExtension(mimeType);
  const originalKey = S3Keys.original(userId, photoId, ext);

  // Upload original to S3
  await uploadObject(originalKey, fileBuffer, mimeType, sizeBytes);

  // Insert DB row with status='processing'
  const sanitizedCaption = caption ? sanitizeCaption(caption) : null;
  const [photo] = await db
    .insert(photos)
    .values({
      id: photoId,
      userId,
      caption: sanitizedCaption,
      status: 'processing',
      originalKey,
      mimeType,
      sizeBytes,
    })
    .returning();

  // Enqueue thumbnail generation job
  const jobData: ThumbnailJobData = { photoId, originalKey, userId, correlationId };
  await thumbnailQueue.add('generate', jobData, {
    jobId: `thumb-${photoId}`,
  });

  return photo;
}

export async function getPhotoById(photoId: string) {
  const [photo] = await db.select().from(photos).where(eq(photos.id, photoId)).limit(1);
  return photo ?? null;
}

export async function buildPhotoResponse(photo: {
  id: string;
  userId: string;
  caption: string | null;
  status: string;
  thumbSmallKey: string | null;
  thumbMediumKey: string | null;
  thumbLargeKey: string | null;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  likeCount: number;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
}): Promise<PhotoResponse> {
  const [small, medium, large] = await Promise.all([
    photo.thumbSmallKey ? getPresignedDownloadUrl(photo.thumbSmallKey, PRESIGNED_URL_EXPIRY) : null,
    photo.thumbMediumKey
      ? getPresignedDownloadUrl(photo.thumbMediumKey, PRESIGNED_URL_EXPIRY)
      : null,
    photo.thumbLargeKey ? getPresignedDownloadUrl(photo.thumbLargeKey, PRESIGNED_URL_EXPIRY) : null,
  ]);

  return {
    id: photo.id,
    userId: photo.userId,
    caption: photo.caption,
    status: photo.status as PhotoResponse['status'],
    thumbnails: { small, medium, large },
    blurhash: photo.blurhash,
    width: photo.width,
    height: photo.height,
    likeCount: photo.likeCount,
    commentCount: photo.commentCount,
    createdAt: photo.createdAt.toISOString(),
    updatedAt: photo.updatedAt.toISOString(),
  };
}

export async function updateCaption(photoId: string, userId: string, caption: string | null) {
  const sanitizedCaption = caption != null ? sanitizeCaption(caption) : null;

  const [updated] = await db
    .update(photos)
    .set({ caption: sanitizedCaption, updatedAt: new Date() })
    .where(and(eq(photos.id, photoId), eq(photos.userId, userId)))
    .returning();

  return updated ?? null;
}

export async function softDeletePhoto(photoId: string, userId: string): Promise<boolean> {
  const [updated] = await db
    .update(photos)
    .set({ status: 'deleted', updatedAt: new Date() })
    .where(and(eq(photos.id, photoId), eq(photos.userId, userId)))
    .returning({ id: photos.id });

  return !!updated;
}
