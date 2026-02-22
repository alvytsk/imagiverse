import type { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

// ============================================================================
// S3 Client (compatible with Garage v2 via path-style addressing)
// ============================================================================
export const s3Client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  // Required for Garage and other S3-compatible stores (not virtual-hosted style)
  forcePathStyle: true,
});

export const S3_BUCKET = env.S3_BUCKET;

// ============================================================================
// S3 Operations
// ============================================================================

/**
 * Uploads an object to S3 / Garage.
 */
export async function uploadObject(
  key: string,
  body: Buffer | Readable,
  contentType: string,
  contentLength?: number
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: contentLength,
    })
  );
}

/**
 * Downloads an object from S3 / Garage and returns its body as a Buffer.
 */
export async function downloadObject(key: string): Promise<Buffer> {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));

  if (!response.Body) {
    throw new Error(`Empty body for S3 key: ${key}`);
  }

  // Stream to buffer
  const stream = response.Body as Readable;
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Deletes an object from S3 / Garage.
 */
export async function deleteObject(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}

/**
 * Generates a pre-signed URL for direct browser download.
 * @param key     - S3 object key
 * @param expiresIn - URL lifetime in seconds (default: 1 hour)
 */
export async function getPresignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), {
    expiresIn,
  });
}

/**
 * Generates a pre-signed URL for direct browser upload.
 * @param key        - Target S3 object key
 * @param contentType - Expected content type (enforced by the presigned URL)
 * @param expiresIn  - URL lifetime in seconds (default: 15 minutes)
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900
): Promise<string> {
  return getSignedUrl(
    s3Client,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn }
  );
}

// ============================================================================
// Key Conventions (matches Appendix B of DEVELOPMENT_PLAN.md)
// ============================================================================

export const S3Keys = {
  original: (userId: string, photoId: string, ext: string) =>
    `originals/${userId}/${photoId}.${ext}`,
  thumbSmall: (photoId: string) => `thumbs/${photoId}/small.webp`,
  thumbMedium: (photoId: string) => `thumbs/${photoId}/medium.webp`,
  thumbLarge: (photoId: string) => `thumbs/${photoId}/large.webp`,
  avatar: (userId: string) => `avatars/${userId}/avatar.webp`,
};

// ============================================================================
// Bucket Initialization (dev / startup helper)
// ============================================================================

/**
 * Ensures the configured bucket exists. In dev, Garage may need this
 * if the bucket hasn't been created via the admin API / init script yet.
 * Logs a warning instead of crashing — the bucket will be required at upload time.
 */
export async function ensureBucketExists(): Promise<void> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
  } catch (err: unknown) {
    const code = (err as { name?: string }).name;
    if (code === 'NotFound' || code === 'NoSuchBucket') {
      try {
        await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
      } catch (createErr) {
        // Garage requires bucket creation via admin API before S3 API can create buckets.
        // If this fails, run: docker/garage-init.sh
        console.warn(
          `[S3] Could not create bucket "${S3_BUCKET}". Run docker/garage-init.sh or initialize Garage manually. Error: ${(createErr as Error).message}`
        );
      }
    } else {
      // Connection error — log and continue (server will fail at first upload)
      console.warn(`[S3] Could not verify bucket "${S3_BUCKET}": ${(err as Error).message}`);
    }
  }
}
