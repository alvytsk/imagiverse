import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { FeedItemResponse, PaginatedResponse } from 'imagiverse-shared';
import { db } from '../../db/index';
import { feedScores, photos, users } from '../../db/schema/index';
import { redis } from '../../plugins/redis';
import { getPresignedDownloadUrl } from '../../plugins/s3';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;
const PRESIGNED_URL_EXPIRY = 3600; // 1 hour
const FEED_CACHE_TTL = 30; // seconds

// ── Cursor encoding/decoding ─────────────────────────────────────────────────

interface FeedCursor {
  score: number;
  id: string;
}

function encodeCursor(score: number, id: string): string {
  const payload: FeedCursor = { score, id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor: string): FeedCursor | null {
  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof payload.score === 'number' && typeof payload.id === 'string') {
      return payload as FeedCursor;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Redis cache helpers ──────────────────────────────────────────────────────

function feedCacheKey(cursor: string | undefined, limit: number): string {
  return `feed:page:${cursor ?? 'first'}:${limit}`;
}

// ── Feed query ───────────────────────────────────────────────────────────────

export async function getFeed(
  cursor?: string,
  limit?: number
): Promise<PaginatedResponse<FeedItemResponse>> {
  const pageLimit = Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);

  // Check Redis cache for first page (no cursor)
  const cacheKey = feedCacheKey(cursor, pageLimit);
  if (!cursor) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  }

  // Build cursor condition (score DESC, photoId DESC)
  let cursorCondition: ReturnType<typeof and> | undefined;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      cursorCondition = or(
        lt(feedScores.score, decoded.score),
        and(eq(feedScores.score, decoded.score), lt(feedScores.photoId, decoded.id))
      );
    }
  }

  const baseCondition = and(eq(photos.status, 'ready'), eq(photos.visibility, 'public'));
  const whereConditions = cursorCondition ? and(baseCondition, cursorCondition) : baseCondition;

  const rows = await db
    .select({
      id: photos.id,
      userId: photos.userId,
      caption: photos.caption,
      thumbSmallKey: photos.thumbSmallKey,
      thumbMediumKey: photos.thumbMediumKey,
      thumbLargeKey: photos.thumbLargeKey,
      blurhash: photos.blurhash,
      width: photos.width,
      height: photos.height,
      likeCount: photos.likeCount,
      commentCount: photos.commentCount,
      createdAt: photos.createdAt,
      score: feedScores.score,
      authorId: users.id,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(feedScores)
    .innerJoin(photos, eq(feedScores.photoId, photos.id))
    .innerJoin(users, eq(photos.userId, users.id))
    .where(whereConditions)
    .orderBy(desc(feedScores.score), desc(feedScores.photoId))
    .limit(pageLimit + 1);

  const hasMore = rows.length > pageLimit;
  const data = rows.slice(0, pageLimit);

  // Generate presigned URLs for thumbnails
  const feedItems: FeedItemResponse[] = await Promise.all(
    data.map(async (row) => {
      const [small, medium, large] = await Promise.all([
        row.thumbSmallKey ? getPresignedDownloadUrl(row.thumbSmallKey, PRESIGNED_URL_EXPIRY) : null,
        row.thumbMediumKey
          ? getPresignedDownloadUrl(row.thumbMediumKey, PRESIGNED_URL_EXPIRY)
          : null,
        row.thumbLargeKey ? getPresignedDownloadUrl(row.thumbLargeKey, PRESIGNED_URL_EXPIRY) : null,
      ]);

      return {
        id: row.id,
        userId: row.userId,
        caption: row.caption,
        thumbnails: { small, medium, large },
        blurhash: row.blurhash,
        width: row.width,
        height: row.height,
        likeCount: row.likeCount,
        commentCount: row.commentCount,
        score: row.score,
        createdAt: row.createdAt.toISOString(),
        author: {
          id: row.authorId,
          username: row.authorUsername,
          displayName: row.authorDisplayName,
          avatarUrl: row.authorAvatarUrl,
        },
      };
    })
  );

  const nextCursor =
    hasMore && data.length > 0
      ? encodeCursor(data[data.length - 1].score, data[data.length - 1].id)
      : null;

  const result: PaginatedResponse<FeedItemResponse> = {
    data: feedItems,
    pagination: { nextCursor, hasMore },
  };

  // Cache first page only
  if (!cursor) {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', FEED_CACHE_TTL);
  }

  return result;
}
