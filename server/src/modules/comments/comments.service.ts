import { and, count, desc, eq, isNull, lt, or, type SQL, sql } from 'drizzle-orm';
import type { CommentResponse, PaginatedResponse } from 'imagiverse-shared';
import sanitizeHtml from 'sanitize-html';
import { db } from '../../db/index';
import { comments, photos, users } from '../../db/schema/index';
import { createNotification } from '../notifications/notifications.service';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const SPAM_URL_THRESHOLD = 3;
const DUPLICATE_WINDOW_HOURS = 1;
const DUPLICATE_THRESHOLD = 3;

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

// ── Spam detection ───────────────────────────────────────────────────────────

export async function detectSpam(userId: string, body: string): Promise<boolean> {
  const urlMatches = body.match(URL_PATTERN);
  if (urlMatches && urlMatches.length > SPAM_URL_THRESHOLD) return true;

  const windowStart = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000);
  const windowStartIso = windowStart.toISOString();
  const [result] = await db
    .select({ value: count() })
    .from(comments)
    .where(
      and(
        eq(comments.userId, userId),
        eq(comments.body, body),
        sql`${comments.createdAt} >= ${windowStartIso}::timestamptz`
      )
    );

  if (result.value >= DUPLICATE_THRESHOLD) return true;

  return false;
}

// ── Reply count helper ───────────────────────────────────────────────────────

async function getReplyCount(commentId: string): Promise<number> {
  const [result] = await db
    .select({ value: count() })
    .from(comments)
    .where(eq(comments.parentId, commentId));
  return result.value;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createComment(
  userId: string,
  photoId: string,
  body: string,
  parentId?: string
): Promise<CommentResponse> {
  const sanitizedBody = sanitizeCommentBody(body);

  if (parentId) {
    const parent = await getCommentById(parentId);
    if (!parent || parent.photoId !== photoId) {
      throw new Error('PARENT_NOT_FOUND');
    }
  }

  const flagged = await detectSpam(userId, sanitizedBody);

  const [comment] = await db
    .insert(comments)
    .values({ userId, photoId, body: sanitizedBody, flagged, parentId: parentId ?? null })
    .returning();

  await db
    .update(photos)
    .set({ commentCount: sql`${photos.commentCount} + 1` })
    .where(eq(photos.id, photoId));

  const [author] = await db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const response: CommentResponse = {
    id: comment.id,
    photoId: comment.photoId,
    userId: comment.userId,
    username: author.username,
    displayName: author.displayName,
    body: comment.body,
    parentId: comment.parentId,
    replyCount: 0,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };

  createCommentNotification(userId, photoId, comment.id, author).catch(() => {});

  return response;
}

async function createCommentNotification(
  actorId: string,
  photoId: string,
  commentId: string,
  actor: { username: string; displayName: string }
): Promise<void> {
  const [photo] = await db
    .select({ userId: photos.userId })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);

  if (!photo) return;

  await createNotification(photo.userId, 'comment', {
    actorId,
    actorUsername: actor.username,
    actorDisplayName: actor.displayName,
    photoId,
    commentId,
  });
}

export async function listComments(
  photoId: string,
  cursor?: string,
  limit?: number
): Promise<PaginatedResponse<CommentResponse>> {
  const pageLimit = Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);

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

  // Only fetch top-level comments (parentId IS NULL)
  const baseCondition = and(eq(comments.photoId, photoId), isNull(comments.parentId));
  const whereConditions = cursorCondition ? and(baseCondition, cursorCondition) : baseCondition;

  const rows = await db
    .select({
      id: comments.id,
      photoId: comments.photoId,
      userId: comments.userId,
      parentId: comments.parentId,
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

  const dataWithReplyCounts = await Promise.all(
    data.map(async (row) => ({
      id: row.id,
      photoId: row.photoId,
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      body: row.body,
      parentId: row.parentId,
      replyCount: await getReplyCount(row.id),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }))
  );

  return {
    data: dataWithReplyCounts,
    pagination: { nextCursor, hasMore },
  };
}

export async function listReplies(
  parentId: string,
  cursor?: string,
  limit?: number
): Promise<PaginatedResponse<CommentResponse>> {
  const pageLimit = Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);

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

  const baseCondition = eq(comments.parentId, parentId);
  const whereConditions = cursorCondition ? and(baseCondition, cursorCondition) : baseCondition;

  const rows = await db
    .select({
      id: comments.id,
      photoId: comments.photoId,
      userId: comments.userId,
      parentId: comments.parentId,
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
      parentId: row.parentId,
      replyCount: 0,
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

  await db
    .update(photos)
    .set({ commentCount: sql`GREATEST(${photos.commentCount} - 1, 0)` })
    .where(eq(photos.id, comment.photoId));

  return 'deleted';
}
