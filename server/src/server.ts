import Fastify from 'fastify';
import { env } from './config/env';
import { runMigrations } from './db/migrate';
import { healthRoutes } from './modules/health/health.routes';
import { ensureBucketExists } from './plugins/s3';

const server = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    ...(env.NODE_ENV !== 'production' && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    }),
  },
  genReqId: () => crypto.randomUUID(),
});

async function start(): Promise<void> {
  // ── Startup tasks ─────────────────────────────────────────────────────────

  server.log.info('Running database migrations...');
  await runMigrations();
  server.log.info('Migrations complete.');

  server.log.info('Verifying S3 bucket...');
  await ensureBucketExists();

  // ── Register plugins ───────────────────────────────────────────────────────
  // Plugins for auth, rate-limiting, multipart etc. will be added in M2–M3

  // ── Register routes ────────────────────────────────────────────────────────
  await server.register(healthRoutes);

  // ── Start listening ────────────────────────────────────────────────────────
  await server.listen({ port: env.API_PORT, host: env.API_HOST });
}

// ── Graceful shutdown ──────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  server.log.info(`Received ${signal}, shutting down gracefully...`);
  await server.close();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
