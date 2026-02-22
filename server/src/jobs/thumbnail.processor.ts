import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { env } from '../config/env';
import { db } from '../db/index';
import { photos } from '../db/schema/index';
import { downloadObject, S3Keys, uploadObject } from '../plugins/s3';
import { bullConnection, THUMBNAIL_QUEUE_NAME, type ThumbnailJobData } from './queue';

// Decompression bomb protection (~100 MP)
(sharp as unknown as { limitInputPixels: number }).limitInputPixels = 100_000_000;

const THUMBNAIL_SIZES = [
  { name: 'small' as const, width: 256 },
  { name: 'medium' as const, width: 800 },
  { name: 'large' as const, width: 1600 },
] as const;

const WEBP_QUALITY = 80;

/**
 * Downloads the original image from S3, generates three WebP thumbnails in
 * parallel (small, medium, large), uploads them back to S3, and updates the
 * photo row with thumbnail keys, dimensions, and `status = 'ready'`.
 */
export async function processThumbnailJob(job: Job<ThumbnailJobData>): Promise<void> {
  const { photoId, originalKey } = job.data;

  // 1. Download original from S3
  const originalBuffer = await downloadObject(originalKey);

  // 2. Validate image with Sharp metadata
  const metadata = await sharp(originalBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Invalid image metadata for photo ${photoId}`);
  }

  // 3. Generate 3 thumbnails in parallel
  const thumbnailResults = await Promise.all(
    THUMBNAIL_SIZES.map(async (size) => {
      const buffer = await sharp(originalBuffer)
        .rotate() // respect EXIF orientation before stripping
        .resize(size.width, undefined, { withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      const key =
        size.name === 'small'
          ? S3Keys.thumbSmall(photoId)
          : size.name === 'medium'
            ? S3Keys.thumbMedium(photoId)
            : S3Keys.thumbLarge(photoId);

      return { name: size.name, buffer, key };
    })
  );

  // 4. Upload all thumbnails to S3
  await Promise.all(
    thumbnailResults.map((thumb) => uploadObject(thumb.key, thumb.buffer, 'image/webp'))
  );

  // 5. Update DB row with thumbnail keys, dimensions, and status
  await db
    .update(photos)
    .set({
      thumbSmallKey: thumbnailResults.find((t) => t.name === 'small')!.key,
      thumbMediumKey: thumbnailResults.find((t) => t.name === 'medium')!.key,
      thumbLargeKey: thumbnailResults.find((t) => t.name === 'large')!.key,
      width: metadata.width,
      height: metadata.height,
      status: 'ready',
      updatedAt: new Date(),
    })
    .where(eq(photos.id, photoId));
}

/**
 * Creates and returns a BullMQ Worker for thumbnail generation.
 * Attaches a `failed` event handler that marks the photo as `failed` once
 * all retry attempts have been exhausted.
 */
export function createThumbnailWorker(): Worker<ThumbnailJobData> {
  const worker = new Worker<ThumbnailJobData>(
    THUMBNAIL_QUEUE_NAME,
    async (job) => processThumbnailJob(job),
    {
      connection: bullConnection,
      concurrency: env.WORKER_CONCURRENCY,
    }
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (isFinalAttempt) {
      console.error(
        `Thumbnail job ${job.id} failed permanently for photo ${job.data.photoId}:`,
        err.message
      );
      try {
        await db
          .update(photos)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(photos.id, job.data.photoId));
      } catch (dbErr) {
        console.error(`Failed to mark photo ${job.data.photoId} as failed:`, dbErr);
      }
    }
  });

  return worker;
}
