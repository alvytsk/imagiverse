import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { ExifData, ExifSummary, FeedItemResponse, PaginatedResponse, PhotoCategorySummary } from 'imagiverse-shared';
import { db } from '../../db/index';
import { categories, feedScores, photos, users } from '../../db/schema/index';
import { feedCacheHitsTotal, feedCacheMissesTotal } from '../../lib/metrics';
import { getCategoryBySlug } from '../categories/categories.service';
import { getUserLikedPhotoIds } from '../likes/likes.service';
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

function feedCacheKey(cursor: string | undefined, limit: number, categorySlug?: string): string {
  return `feed:page:${cursor ?? 'first'}:${limit}:${categorySlug ?? 'all'}`;
}

// ── Feed query ───────────────────────────────────────────────────────────────

export async function getFeed(
  cursor?: string,
  limit?: number,
  currentUserId?: string,
  categorySlug?: string
): Promise<PaginatedResponse<FeedItemResponse>> {
  const pageLimit = Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);

  // Resolve category slug to ID
  let filterCategoryId: string | undefined;
  if (categorySlug) {
    const cat = await getCategoryBySlug(categorySlug);
    if (!cat) {
      return { data: [], pagination: { nextCursor: null, hasMore: false } };
    }
    filterCategoryId = cat.id;
  }

  // Check Redis cache for first page (no cursor)
  const cacheKey = feedCacheKey(cursor, pageLimit, categorySlug);
  if (!cursor) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      feedCacheHitsTotal.inc();
      const result = JSON.parse(cached) as PaginatedResponse<FeedItemResponse>;
      // Enrich with user-specific like status
      if (currentUserId && result.data.length > 0) {
        const likedSet = await getUserLikedPhotoIds(
          currentUserId,
          result.data.map((item) => item.id)
        );
        for (const item of result.data) {
          item.likedByMe = likedSet.has(item.id);
        }
      }
      return result;
    }
    feedCacheMissesTotal.inc();
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

  const conditions = [eq(photos.status, 'ready'), eq(photos.visibility, 'public')];
  if (filterCategoryId) {
    conditions.push(eq(photos.categoryId, filterCategoryId));
  }
  const baseCondition = and(...conditions);
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
      exifData: photos.exifData,
      createdAt: photos.createdAt,
      score: feedScores.score,
      authorId: users.id,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      authorAvatarUrl: users.avatarUrl,
      categoryId: photos.categoryId,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(feedScores)
    .innerJoin(photos, eq(feedScores.photoId, photos.id))
    .innerJoin(users, eq(photos.userId, users.id))
    .leftJoin(categories, eq(photos.categoryId, categories.id))
    .where(whereConditions)
    .orderBy(desc(feedScores.score), desc(feedScores.photoId))
    .limit(pageLimit + 1);

  const hasMore = rows.length > pageLimit;
  const data = rows.slice(0, pageLimit);

  // Batch-check which photos the current user has liked
  const likedSet = currentUserId
    ? await getUserLikedPhotoIds(currentUserId, data.map((r) => r.id))
    : new Set<string>();

  // Generate presigned URLs for thumbnails
  const feedItems: FeedItemResponse[] = await Promise.all(
    data.map(async (row) => {
      const [small, medium, large, avatarUrl] = await Promise.all([
        row.thumbSmallKey ? getPresignedDownloadUrl(row.thumbSmallKey, PRESIGNED_URL_EXPIRY) : null,
        row.thumbMediumKey
          ? getPresignedDownloadUrl(row.thumbMediumKey, PRESIGNED_URL_EXPIRY)
          : null,
        row.thumbLargeKey ? getPresignedDownloadUrl(row.thumbLargeKey, PRESIGNED_URL_EXPIRY) : null,
        row.authorAvatarUrl ? getPresignedDownloadUrl(row.authorAvatarUrl, PRESIGNED_URL_EXPIRY) : null,
      ]);

      const exif = row.exifData as ExifData | null;
      const exifSummary: ExifSummary | null = exif
        ? {
            cameraModel: exif.cameraModel,
            focalLength: exif.focalLength,
            fNumber: exif.fNumber,
            iso: exif.iso,
            exposureTime: exif.exposureTime,
          }
        : null;

      const category: PhotoCategorySummary | null =
        row.categoryId && row.categoryName && row.categorySlug
          ? { id: row.categoryId, name: row.categoryName, slug: row.categorySlug }
          : null;

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
        likedByMe: likedSet.has(row.id),
        exifSummary,
        category,
        score: row.score,
        createdAt: row.createdAt.toISOString(),
        author: {
          id: row.authorId,
          username: row.authorUsername,
          displayName: row.authorDisplayName,
          avatarUrl,
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
