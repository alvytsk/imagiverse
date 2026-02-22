import Fastify from 'fastify';
import { env } from './config/env';

// ============================================================================
// Worker Entry Point
//
// This process runs BullMQ workers for async tasks:
//   - generate-thumbnails (M3.3)
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

async function start(): Promise<void> {
  // Start health HTTP server
  await healthServer.listen({ port: env.WORKER_PORT, host: env.API_HOST });
  healthServer.log.info(`Worker health endpoint: http://${env.API_HOST}:${env.WORKER_PORT}/health`);

  // BullMQ workers will be registered here in M3 and M5.
  // Placeholder log to confirm worker process is running.
  healthServer.log.info('BullMQ worker started (jobs registered in M3/M5)');
}

const shutdown = async (signal: string) => {
  healthServer.log.info(`Received ${signal}, shutting down worker...`);
  // Gracefully drain BullMQ workers before closing (added in M3)
  await healthServer.close();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  console.error('Fatal worker startup error:', err);
  process.exit(1);
});
