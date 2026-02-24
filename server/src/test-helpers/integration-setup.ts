/**
 * Integration test setup using Testcontainers.
 *
 * Spins up real PostgreSQL + Redis containers per test suite.
 * Runs Drizzle migrations against the test Postgres.
 * Creates a real Fastify app instance with all routes registered.
 *
 * Usage in integration tests:
 *   import { setupIntegration } from '../../test-helpers/integration-setup';
 *   const ctx = setupIntegration();
 *   // ctx.app, ctx.db are available in tests
 */
import path from 'node:path';
import cookiePlugin from '@fastify/cookie';
import corsPlugin from '@fastify/cors';
import rateLimitPlugin from '@fastify/rate-limit';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import Fastify, { type FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import postgres from 'postgres';
import * as schema from '../db/schema/index';

export interface IntegrationContext {
  app: FastifyInstance;
  db: ReturnType<typeof drizzle<typeof schema>>;
  redis: Redis;
  pgConnectionString: string;
  redisUrl: string;
}

/**
 * Call this at the top of a describe() block.
 * Returns a context object whose properties are populated in beforeAll.
 */
export function setupIntegration(): IntegrationContext {
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let queryClient: ReturnType<typeof postgres>;

  const ctx: IntegrationContext = {} as IntegrationContext;

  beforeAll(async () => {
    // Start containers in parallel
    [pgContainer, redisContainer] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
    ]);

    const pgConnectionString = pgContainer.getConnectionUri();
    const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

    ctx.pgConnectionString = pgConnectionString;
    ctx.redisUrl = redisUrl;

    // Set env vars BEFORE importing any module that reads them
    process.env['DATABASE_URL'] = pgConnectionString;
    process.env['REDIS_URL'] = redisUrl;
    process.env['NODE_ENV'] = 'test';
    process.env['JWT_SECRET'] = 'integration-test-jwt-secret-at-least-32-chars';
    process.env['JWT_REFRESH_SECRET'] = 'integration-test-refresh-secret-at-least-32-chars';
    process.env['S3_ENDPOINT'] = 'http://localhost:3900';
    process.env['S3_BUCKET'] = 'imagiverse-media';
    process.env['S3_ACCESS_KEY'] = 'test-access-key';
    process.env['S3_SECRET_KEY'] = 'test-secret-key-placeholder-value';

    // Create DB connection and run migrations
    queryClient = postgres(pgConnectionString, { max: 10 });
    const db = drizzle(queryClient, { schema });
    ctx.db = db;

    // Run migrations
    const migrationClient = postgres(pgConnectionString, { max: 1 });
    const migrationDb = drizzle(migrationClient);
    await migrate(migrationDb, {
      migrationsFolder: path.join(__dirname, '../../drizzle'),
    });
    await migrationClient.end();

    // Create Redis client
    ctx.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });

    // Build Fastify app — we need to dynamically import route modules
    // AFTER setting env vars so they pick up the right config
    const app = Fastify({ logger: false });

    await app.register(corsPlugin, { origin: true, credentials: true });
    await app.register(cookiePlugin);
    // Use in-memory rate limiting for tests (no Redis dependency for rate-limit plugin)
    await app.register(rateLimitPlugin, {
      max: 1000,
      timeWindow: '1 minute',
    });

    // Import route modules dynamically to pick up fresh env
    const { authRoutes } = await import('../modules/auth/auth.routes');
    const { photoRoutes } = await import('../modules/photos/photos.routes');
    const { likesRoutes } = await import('../modules/likes/likes.routes');
    const { commentsRoutes } = await import('../modules/comments/comments.routes');
    const { feedRoutes } = await import('../modules/feed/feed.routes');
    const { usersRoutes } = await import('../modules/users/users.routes');
    const { healthRoutes } = await import('../modules/health/health.routes');

    await app.register(healthRoutes);
    await app.register(authRoutes, { prefix: '/api' });
    await app.register(photoRoutes, { prefix: '/api' });
    await app.register(likesRoutes, { prefix: '/api' });
    await app.register(commentsRoutes, { prefix: '/api' });
    await app.register(feedRoutes, { prefix: '/api' });
    await app.register(usersRoutes, { prefix: '/api' });

    await app.ready();
    ctx.app = app;
  }, 120_000);

  afterAll(async () => {
    if (ctx.app) await ctx.app.close();
    if (ctx.redis) await ctx.redis.quit();
    if (queryClient) await queryClient.end();
    if (pgContainer) await pgContainer.stop();
    if (redisContainer) await redisContainer.stop();
  }, 30_000);

  return ctx;
}

/**
 * Truncates all data tables (preserving schema) between tests.
 */
export async function truncateAllTables(db: IntegrationContext['db']): Promise<void> {
  await db.execute(sql`
    TRUNCATE feed_scores, comments, likes, photos, users CASCADE
  `);
}
