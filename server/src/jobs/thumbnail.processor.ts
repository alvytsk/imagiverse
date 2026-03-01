import { encode } from 'blurhash';
import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { ExifData } from 'imagiverse-shared';
import sharp from 'sharp';
import { env } from '../config/env';
import { db } from '../db/index';
import { photos } from '../db/schema/index';
import { extractCuratedExif } from '../lib/exif';
import { logger } from '../lib/logger';
import { downloadObject, S3Keys, uploadObject } from '../plugins/s3';
import { bullmqJobsDuration, bullmqJobsTotal } from '../lib/metrics';
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
  const { photoId, originalKey, correlationId } = job.data;
  const jobLog = logger.child({ jobId: job.id, photoId, correlationId });

  jobLog.info('thumbnail job started');

  let t = Date.now();

  // 1. Download original from S3
  const originalBuffer = await downloadObject(originalKey);
  jobLog.info({ stage: 'download_original', durationMs: Date.now() - t }, 'stage complete');

  // 2. Validate image with Sharp metadata
  t = Date.now();
  const metadata = await sharp(originalBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Invalid image metadata for photo ${photoId}`);
  }
  jobLog.info({ stage: 'read_metadata', durationMs: Date.now() - t }, 'stage complete');

  // 3. Extract EXIF data (before thumbnails strip it via WebP conversion)
  t = Date.now();
  let exifData: ExifData | null = null;
  if (metadata.exif) {
    try {
      exifData = extractCuratedExif(metadata.exif);
      if (exifData) {
        jobLog.info(
          { cameraMake: exifData.cameraMake, cameraModel: exifData.cameraModel },
          'EXIF extracted'
        );
      } else {
        jobLog.info('EXIF buffer present but no useful fields found');
      }
    } catch (err) {
      jobLog.warn({ err }, 'EXIF parsing failed, storing null');
    }
  } else {
    jobLog.info({ format: metadata.format }, 'No EXIF buffer in image metadata');
  }
  jobLog.info({ stage: 'extract_exif', durationMs: Date.now() - t }, 'stage complete');

  // 4. Generate 3 thumbnails + blurhash in parallel
  t = Date.now();
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

  const smallThumb = thumbnailResults.find((t) => t.name === 'small')!;
  const blurhashSize = 32;
  const { data: pixels, info } = await sharp(smallThumb.buffer)
    .resize(blurhashSize, blurhashSize, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurhash = encode(new Uint8ClampedArray(pixels), info.width, info.height, 4, 3);
  jobLog.info({ stage: 'sharp_resize', durationMs: Date.now() - t }, 'stage complete');

  // 5. Upload all thumbnails to S3
  t = Date.now();
  await Promise.all(
    thumbnailResults.map((thumb) => uploadObject(thumb.key, thumb.buffer, 'image/webp'))
  );
  jobLog.info({ stage: 'upload_thumbnails', durationMs: Date.now() - t }, 'stage complete');

  // 6. Update DB row with thumbnail keys, dimensions, blurhash, EXIF, and status
  t = Date.now();
  await db
    .update(photos)
    .set({
      thumbSmallKey: smallThumb.key,
      thumbMediumKey: thumbnailResults.find((t) => t.name === 'medium')!.key,
      thumbLargeKey: thumbnailResults.find((t) => t.name === 'large')!.key,
      width: metadata.width,
      height: metadata.height,
      blurhash,
      exifData,
      status: 'ready',
      updatedAt: new Date(),
    })
    .where(eq(photos.id, photoId));
  jobLog.info({ stage: 'db_update', durationMs: Date.now() - t }, 'stage complete');

  jobLog.info('thumbnail job completed');
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

  worker.on('completed', (job) => {
    const durationSec =
      job.finishedOn && job.processedOn ? (job.finishedOn - job.processedOn) / 1000 : 0;
    bullmqJobsTotal.inc({ queue: THUMBNAIL_QUEUE_NAME, status: 'completed' });
    bullmqJobsDuration.observe({ queue: THUMBNAIL_QUEUE_NAME }, durationSec);
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const failLog = logger.child({
      jobId: job.id,
      photoId: job.data.photoId,
      correlationId: job.data.correlationId,
      attempt: job.attemptsMade,
    });
    bullmqJobsTotal.inc({ queue: THUMBNAIL_QUEUE_NAME, status: 'failed' });
    const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (isFinalAttempt) {
      failLog.error({ err: err.message }, 'thumbnail job failed permanently');
      try {
        await db
          .update(photos)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(photos.id, job.data.photoId));
      } catch (dbErr) {
        failLog.error({ err: dbErr }, 'failed to mark photo as failed');
      }
    } else {
      failLog.warn({ err: err.message }, 'thumbnail job attempt failed, will retry');
    }
  });

  return worker;
}
