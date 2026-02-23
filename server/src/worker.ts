import './load-env';
import type { Worker } from 'bullmq';
import Fastify from 'fastify';
import { env } from './config/env';
import { createFeedScoreWorker } from './jobs/feed-score.processor';
import { feedScoreQueue } from './jobs/queue';
import { createThumbnailWorker } from './jobs/thumbnail.processor';

// ============================================================================
// Worker Entry Point
//
// This process runs BullMQ workers for async tasks:
//   - generate-thumbnails (M3)
//   - recalc-feed-score   (M5.2)
//   - cleanup-stale       (M3.4 / M6.4)
//
// It also exposes a lightweight HTTP health endpoint for Docker/K8s liveness.
// ============================================================================

const healthServer = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    ...(env.NODE_ENV !== 'production' && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    }),
  },
});

healthServer.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

let thumbnailWorker: Worker | undefined;
let feedScoreWorker: Worker | undefined;

async function start(): Promise<void> {
  // Start health HTTP server
  await healthServer.listen({ port: env.WORKER_PORT, host: env.API_HOST });
  healthServer.log.info(`Worker health endpoint: http://${env.API_HOST}:${env.WORKER_PORT}/health`);

  // Start BullMQ workers
  thumbnailWorker = createThumbnailWorker();
  healthServer.log.info('Thumbnail worker started');

  feedScoreWorker = createFeedScoreWorker();
  healthServer.log.info('Feed score recalc worker started');

  // Schedule feed score recalculation every 5 minutes
  await feedScoreQueue.upsertJobScheduler(
    'feed-score-cron',
    { every: 5 * 60 * 1000 },
    { name: 'recalc' }
  );
  healthServer.log.info('Feed score cron scheduled (every 5 min)');
}

const shutdown = async (signal: string) => {
  healthServer.log.info(`Received ${signal}, shutting down worker...`);
  // Gracefully drain BullMQ workers before closing health server
  if (feedScoreWorker) {
    await feedScoreWorker.close();
  }
  if (thumbnailWorker) {
    await thumbnailWorker.close();
  }
  await healthServer.close();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  console.error('Fatal worker startup error:', err);
  process.exit(1);
});
