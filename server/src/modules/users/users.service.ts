import { and, desc, eq, lt, or, type SQL, sql } from 'drizzle-orm';
import type {
  ExifData,
  MeProfileResponse,
  PaginatedResponse,
  PhotoResponse,
  PublicUser,
} from 'imagiverse-shared';
import sanitizeHtml from 'sanitize-html';
import { transliterate } from 'transliteration';
import { db } from '../../db/index';
import { photos, users } from '../../db/schema/index';
import { getPresignedDownloadUrl } from '../../plugins/s3';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;
const PRESIGNED_URL_EXPIRY = 3600; // 1 hour

/**
 * Normalizes a search query for pg_trgm similarity comparison:
 * - Lowercase
 * - Transliterate non-Latin characters (Cyrillic→Latin etc.)
 * - Remove diacritics via transliteration
 */
export function normalizeSearchQuery(query: string): string {
  return transliterate(query).toLowerCase().trim();
}

/**
 * Searches users using pg_trgm similarity across display_name, username, and city.
 *
 * The query is transliterated (Cyrillic→Latin) before comparison, enabling
 * searches like "Aleksey" to find "Алексей" (because the DB columns are
 * already stored as `immutable_unaccent(lower(...))` via generated columns,
 * and transliteration converts Cyrillic to Latin).
 *
 * Results ordered by: relevance DESC, username ASC.
 */
export async function searchUsers(query: string, limit?: number): Promise<PublicUser[]> {
  const pageLimit = Math.min(Math.max(limit ?? DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);
  const normalized = normalizeSearchQuery(query);

  if (normalized.length === 0) return [];

  const rows = await db.execute(sql`
    SELECT
      u.id,
      u.username,
      u.display_name AS "displayName",
      u.city,
      u.avatar_url AS "avatarUrl",
      u.bio,
      u.created_at AS "createdAt",
      COALESCE(
        (SELECT COUNT(*)::int FROM photos p WHERE p.user_id = u.id AND p.status = 'ready'),
        0
      ) AS "photoCount",
      GREATEST(
        similarity(u.search_name, ${normalized}),
        similarity(u.search_user, ${normalized}),
        similarity(u.search_city, ${normalized})
      ) AS relevance
    FROM users u
    WHERE u.search_name % ${normalized}
       OR u.search_user % ${normalized}
       OR u.search_city % ${normalized}
    ORDER BY relevance DESC, u.username ASC
    LIMIT ${pageLimit}
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    username: row.username as string,
    displayName: row.displayName as string,
    city: (row.city as string) ?? null,
    avatarUrl: (row.avatarUrl as string) ?? null,
    bio: (row.bio as string) ?? null,
    photoCount: Number(row.photoCount),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  }));
}

// ── Text sanitization ───────────────────────────────────────────────────────

function sanitizeText(text: string): string {
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
}

// ── Cursor encoding/decoding (createdAt, id) ────────────────────────────────

interface PhotoCursor {
  createdAt: string;
  id: string;
}

function encodeCursor(createdAt: Date, id: string): string {
  const payload: PhotoCursor = { createdAt: createdAt.toISOString(), id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor: string): PhotoCursor | null {
  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof payload.createdAt === 'string' && typeof payload.id === 'string') {
      return payload as PhotoCursor;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Profile endpoints ───────────────────────────────────────────────────────

export async function getMyProfile(userId: string): Promise<MeProfileResponse | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      city: users.city,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(photos)
    .where(and(eq(photos.userId, userId), eq(photos.status, 'ready')));

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    city: user.city,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    role: user.role,
    photoCount: countRow?.count ?? 0,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function getPublicProfile(userId: string): Promise<PublicUser | null> {
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      city: users.city,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(photos)
    .where(
      and(eq(photos.userId, userId), eq(photos.status, 'ready'), eq(photos.visibility, 'public'))
    );

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    city: user.city,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    photoCount: countRow?.count ?? 0,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function updateProfile(
  userId: string,
  input: { displayName?: string; city?: string | null; bio?: string | null }
): Promise<MeProfileResponse | null> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (input.displayName !== undefined) {
    updates.displayName = sanitizeText(input.displayName);
  }
  if (input.city !== undefined) {
    updates.city = input.city != null ? sanitizeText(input.city) : null;
  }
  if (input.bio !== undefined) {
    updates.bio = input.bio != null ? sanitizeText(input.bio) : null;
  }

  await db.update(users).set(updates).where(eq(users.id, userId));

  return getMyProfile(userId);
}

// ── User photos ─────────────────────────────────────────────────────────────

export async function getUserPhotos(
  userId: string,
  cursor?: string,
  limit?: number,
  requesterId?: string
): Promise<PaginatedResponse<PhotoResponse>> {
  const pageLimit = Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);

  // Build cursor condition (newest-first: created_at DESC, id DESC)
  let cursorCondition: SQL | undefined;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      const cursorDate = new Date(decoded.createdAt);
      cursorCondition = or(
        lt(photos.createdAt, cursorDate),
        and(eq(photos.createdAt, cursorDate), lt(photos.id, decoded.id))
      );
    }
  }

  const isOwner = requesterId === userId;
  const baseCondition = and(
    eq(photos.userId, userId),
    eq(photos.status, 'ready'),
    isOwner ? undefined : eq(photos.visibility, 'public')
  );
  const whereConditions = cursorCondition ? and(baseCondition, cursorCondition) : baseCondition;

  const rows = await db
    .select({
      id: photos.id,
      userId: photos.userId,
      caption: photos.caption,
      status: photos.status,
      visibility: photos.visibility,
      thumbSmallKey: photos.thumbSmallKey,
      thumbMediumKey: photos.thumbMediumKey,
      thumbLargeKey: photos.thumbLargeKey,
      blurhash: photos.blurhash,
      width: photos.width,
      height: photos.height,
      exifData: photos.exifData,
      likeCount: photos.likeCount,
      commentCount: photos.commentCount,
      createdAt: photos.createdAt,
      updatedAt: photos.updatedAt,
    })
    .from(photos)
    .where(whereConditions)
    .orderBy(desc(photos.createdAt), desc(photos.id))
    .limit(pageLimit + 1);

  const hasMore = rows.length > pageLimit;
  const data = rows.slice(0, pageLimit);

  // Generate presigned URLs for thumbnails
  const photoResponses: PhotoResponse[] = await Promise.all(
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
        status: row.status as PhotoResponse['status'],
        visibility: row.visibility as PhotoResponse['visibility'],
        thumbnails: { small, medium, large },
        blurhash: row.blurhash,
        width: row.width,
        height: row.height,
        likeCount: row.likeCount,
        commentCount: row.commentCount,
        likedByMe: false,
        exifData: (row.exifData as ExifData) ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    })
  );

  const nextCursor =
    hasMore && data.length > 0
      ? encodeCursor(data[data.length - 1].createdAt, data[data.length - 1].id)
      : null;

  return {
    data: photoResponses,
    pagination: { nextCursor, hasMore },
  };
}
