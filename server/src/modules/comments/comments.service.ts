import { and, desc, eq, lt, or, type SQL, sql } from 'drizzle-orm';
import type { CommentResponse, PaginatedResponse } from 'imagiverse-shared';
import sanitizeHtml from 'sanitize-html';
import { db } from '../../db/index';
import { comments, photos, users } from '../../db/schema/index';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

// ── Sanitization ─────────────────────────────────────────────────────────────

export function sanitizeCommentBody(text: string): string {
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
}

// ── Cursor encoding/decoding ─────────────────────────────────────────────────

interface CommentCursor {
  createdAt: string;
  id: string;
}

function encodeCursor(createdAt: Date, id: string): string {
  const payload: CommentCursor = { createdAt: createdAt.toISOString(), id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor: string): CommentCursor | null {
  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof payload.createdAt === 'string' && typeof payload.id === 'string') {
      return payload as CommentCursor;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Photo lookup ─────────────────────────────────────────────────────────────

export async function getReadyPhoto(photoId: string) {
  const [photo] = await db
    .select({ id: photos.id, status: photos.status })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);

  if (!photo || photo.status !== 'ready') return null;
  return photo;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createComment(
  userId: string,
  photoId: string,
  body: string
): Promise<CommentResponse> {
  const sanitizedBody = sanitizeCommentBody(body);

  const [comment] = await db
    .insert(comments)
    .values({ userId, photoId, body: sanitizedBody })
    .returning();

  // Increment denormalized counter
  await db
    .update(photos)
    .set({ commentCount: sql`${photos.commentCount} + 1` })
    .where(eq(photos.id, photoId));

  // Fetch author info for response
  const [author] = await db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    id: comment.id,
    photoId: comment.photoId,
    userId: comment.userId,
    username: author.username,
    displayName: author.displayName,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

export async function listComments(
  photoId: string,
  cursor?: string,
  limit?: number
): Promise<PaginatedResponse<CommentResponse>> {
  const pageLimit = Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);

  // Build cursor condition (newest-first: created_at DESC, id DESC)
  let cursorCondition: SQL | undefined;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      const cursorDate = new Date(decoded.createdAt);
      cursorCondition = or(
        lt(comments.createdAt, cursorDate),
        and(eq(comments.createdAt, cursorDate), lt(comments.id, decoded.id))
      );
    }
  }

  const whereConditions = cursorCondition
    ? and(eq(comments.photoId, photoId), cursorCondition)
    : eq(comments.photoId, photoId);

  const rows = await db
    .select({
      id: comments.id,
      photoId: comments.photoId,
      userId: comments.userId,
      body: comments.body,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      username: users.username,
      displayName: users.displayName,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(whereConditions)
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(pageLimit + 1);

  const hasMore = rows.length > pageLimit;
  const data = rows.slice(0, pageLimit);

  const nextCursor =
    hasMore && data.length > 0
      ? encodeCursor(data[data.length - 1].createdAt, data[data.length - 1].id)
      : null;

  return {
    data: data.map((row) => ({
      id: row.id,
      photoId: row.photoId,
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    pagination: { nextCursor, hasMore },
  };
}

export async function getCommentById(commentId: string) {
  const [comment] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  return comment ?? null;
}

export async function deleteComment(
  commentId: string,
  userId: string
): Promise<'deleted' | 'not_found' | 'forbidden'> {
  const comment = await getCommentById(commentId);
  if (!comment) return 'not_found';
  if (comment.userId !== userId) return 'forbidden';

  await db.delete(comments).where(eq(comments.id, commentId));

  // Decrement denormalized counter (floor at 0)
  await db
    .update(photos)
    .set({ commentCount: sql`GREATEST(${photos.commentCount} - 1, 0)` })
    .where(eq(photos.id, comment.photoId));

  return 'deleted';
}
