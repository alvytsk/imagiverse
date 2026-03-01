import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index';
import { redis } from '../../plugins/redis';
import { s3Client, S3_BUCKET } from '../../plugins/s3';

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

    // Check Redis
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'fail';
    }

    // Check S3
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
      checks.s3 = 'ok';
    } catch {
      checks.s3 = 'fail';
    }

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
