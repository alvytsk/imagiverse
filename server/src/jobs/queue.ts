import { Queue } from 'bullmq';
import { env } from '../config/env';

// ============================================================================
// BullMQ Redis Connection
//
// BullMQ requires `maxRetriesPerRequest: null` — this differs from the main
// redis plugin which uses `maxRetriesPerRequest: 3`. We parse the URL and
// build a plain connection object so BullMQ manages its own ioredis instances.
// ============================================================================

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    db: parsed.pathname ? Number(parsed.pathname.slice(1)) || 0 : 0,
    maxRetriesPerRequest: null as null,
  };
}

export const bullConnection = parseRedisUrl(env.REDIS_URL);

// ============================================================================
// Thumbnail Queue
// ============================================================================

export const THUMBNAIL_QUEUE_NAME = 'generate-thumbnails';

export interface ThumbnailJobData {
  photoId: string;
  originalKey: string;
  userId: string;
}

export const thumbnailQueue = new Queue<ThumbnailJobData>(THUMBNAIL_QUEUE_NAME, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});
