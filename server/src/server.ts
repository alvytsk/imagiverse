import './load-env';
import cookiePlugin from '@fastify/cookie';
import corsPlugin from '@fastify/cors';
import helmetPlugin from '@fastify/helmet';
import rateLimitPlugin from '@fastify/rate-limit';
import Fastify from 'fastify';
import { env } from './config/env';
import { runMigrations } from './db/migrate';
import { authenticate } from './middleware/auth';
import { adminRoutes } from './modules/admin/admin.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { commentsRoutes } from './modules/comments/comments.routes';
import { feedRoutes } from './modules/feed/feed.routes';
import { healthRoutes } from './modules/health/health.routes';
import { likesRoutes } from './modules/likes/likes.routes';
import { notificationsRoutes } from './modules/notifications/notifications.routes';
import { photoRoutes } from './modules/photos/photos.routes';
import { usersRoutes } from './modules/users/users.routes';
import { redis } from './plugins/redis';
import { ensureBucketExists } from './plugins/s3';

// Make `authenticate` importable by feature modules via the shared export
export { authenticate };

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

  await server.register(helmetPlugin);

  await server.register(corsPlugin, {
    origin: env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });

  await server.register(cookiePlugin);

  await server.register(rateLimitPlugin, {
    max: 300,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (request) => request.ip,
  });

  // ── Register routes ────────────────────────────────────────────────────────

  await server.register(healthRoutes);
  await server.register(authRoutes, { prefix: '/api' });
  await server.register(photoRoutes, { prefix: '/api' });
  await server.register(likesRoutes, { prefix: '/api' });
  await server.register(commentsRoutes, { prefix: '/api' });
  await server.register(feedRoutes, { prefix: '/api' });
  await server.register(notificationsRoutes, { prefix: '/api' });
  await server.register(usersRoutes, { prefix: '/api' });
  await server.register(adminRoutes, { prefix: '/api' });

  // ── Start listening ────────────────────────────────────────────────────────
  await server.listen({ port: env.API_PORT, host: env.API_HOST });
}

// ── Graceful shutdown ──────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  server.log.info(`Received ${signal}, shutting down gracefully...`);
  await server.close();
  await redis.quit();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
