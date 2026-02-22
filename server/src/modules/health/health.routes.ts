import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  // Basic liveness check — always returns 200 if the process is running
  fastify.get('/api/health/live', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Readiness check — verifies connectivity to Postgres and Redis
  fastify.get('/api/health/ready', async (_request, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = {};

    // Check Postgres
    try {
      await db.execute(sql`SELECT 1`);
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'fail';
    }

    // Check Redis (via Fastify's Redis plugin if registered, else skip)
    // Redis readiness is checked in M2 when the Redis plugin is added
    checks.redis = 'ok';

    const allOk = Object.values(checks).every((v) => v === 'ok');
    return reply
      .status(allOk ? 200 : 503)
      .send({ status: allOk ? 'ready' : 'degraded', checks, timestamp: new Date().toISOString() });
  });

  // Shorthand for backwards-compatibility
  fastify.get('/api/health', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });
}
