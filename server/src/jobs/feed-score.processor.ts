import { Worker } from 'bullmq';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';
import { logger } from '../lib/logger';
import { redis } from '../plugins/redis';
import { bullConnection, FEED_SCORE_QUEUE_NAME } from './queue';

const GRAVITY = 1.5;
const BOOST_HOURS = 2;
const FRESHNESS_BOOST = 1;

/**
 * Recalculates ALL feed scores in a single bulk SQL statement.
 *
 * The formula: score = (like_count + FRESHNESS_BOOST) / (hours_since_upload + 2) ^ 1.5
 *
 * FRESHNESS_BOOST gives every photo a non-zero starting score so fresh
 * uploads appear in the feed before they earn any likes.
 *
 * Uses Postgres `EXTRACT(EPOCH ...)` for precise hour calculation.
 * UPSERTs into feed_scores so new photos are included automatically.
 */
export async function recalculateAllFeedScores(): Promise<void> {
  logger.debug('feed score recalculation started');
  await db.execute(sql`
    INSERT INTO feed_scores (photo_id, score, updated_at)
    SELECT
      p.id,
      (p.like_count + ${FRESHNESS_BOOST})::double precision
           / POWER(
               GREATEST(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600, 0)
               + ${BOOST_HOURS},
               ${GRAVITY}
             ),
      now()
    FROM photos p
    WHERE p.status = 'ready'
    ON CONFLICT (photo_id) DO UPDATE SET
      score = EXCLUDED.score,
      updated_at = EXCLUDED.updated_at
  `);

  // Invalidate cached feed pages
  await invalidateFeedCache();
  logger.debug('feed score recalculation completed');
}

/** Removes all cached feed pages from Redis. */
export async function invalidateFeedCache(): Promise<void> {
  const keys = await redis.keys('feed:page:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Creates a BullMQ Worker for the feed-score-recalc cron job.
 */
export function createFeedScoreWorker(): Worker {
  const worker = new Worker(
    FEED_SCORE_QUEUE_NAME,
    async () => {
      await recalculateAllFeedScores();
    },
    {
      connection: bullConnection,
      concurrency: 1,
    }
  );

  worker.on('failed', (_job, err) => {
    logger.error({ err: err.message }, 'feed score recalc job failed');
  });

  return worker;
}
