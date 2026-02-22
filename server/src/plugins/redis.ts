import Redis from 'ioredis';
import { env } from '../config/env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on('error', (err) => {
  // Log but don't crash — the server can degrade gracefully
  console.error('Redis client error:', err.message);
});

export const RedisKeys = {
  refreshToken: (userId: string) => `refresh:${userId}`,
  uploadRate: (userId: string) => `upload-rate:${userId}`,
} as const;

/** TTL in seconds for refresh tokens stored in Redis (matches JWT_REFRESH_EXPIRES_IN default) */
export const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days
