import { redis } from '../plugins/redis';
import { getPresignedDownloadUrl } from '../plugins/s3';

// Cache presigned URLs in Redis so repeated API calls return the same URL,
// allowing the browser HTTP cache to work. TTL is 55 min — 5 min short of
// the 1-hour URL expiry — so we never serve an already-expired URL.
const PRESIGNED_CACHE_TTL = 55 * 60; // 3300 seconds

export async function getCachedPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const cacheKey = `presigned:${key}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const url = await getPresignedDownloadUrl(key, expiresIn);
  await redis.set(cacheKey, url, 'EX', PRESIGNED_CACHE_TTL);
  return url;
}
