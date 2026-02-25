import type { Column } from 'drizzle-orm';
import { and, count, desc, eq, isNotNull, isNull, lt, or, type SQL, sql } from 'drizzle-orm';
import type {
  AdminCommentResponse,
  AdminPhotoResponse,
  AdminStatsResponse,
  AdminUserResponse,
  PaginatedResponse,
  ReportResponse,
} from 'imagiverse-shared';
import { db } from '../../db/index';
import { comments, feedScores, photos, reports, users } from '../../db/schema/index';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

// ── Cursor helpers ───────────────────────────────────────────────────────────

interface CreatedAtCursor {
  createdAt: string;
  id: string;
}

function encodeCursor(createdAt: Date, id: string): string {
  const payload: CreatedAtCursor = { createdAt: createdAt.toISOString(), id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor: string): CreatedAtCursor | null {
  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof payload.createdAt === 'string' && typeof payload.id === 'string') {
      return payload as CreatedAtCursor;
    }
    return null;
  } catch {
    return null;
  }
}

function buildCursorCondition(
  cursor: string | undefined,
  createdAtCol: Column,
  idCol: Column
): SQL | undefined {
  if (!cursor) return undefined;
  const decoded = decodeCursor(cursor);
  if (!decoded) return undefined;
  const cursorDate = new Date(decoded.createdAt);
  return or(lt(createdAtCol, cursorDate), and(eq(createdAtCol, cursorDate), lt(idCol, decoded.id)));
}

function clampLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
}

// ── Admin Stats ──────────────────────────────────────────────────────────────

export async function getAdminStats(): Promise<AdminStatsResponse> {
  const [
    [userCount],
    [photoCount],
    [commentCount],
    [pendingReportCount],
    [flaggedCount],
    [bannedCount],
    [failedCount],
  ] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(photos),
    db.select({ value: count() }).from(comments),
    db.select({ value: count() }).from(reports).where(eq(reports.status, 'pending')),
    db.select({ value: count() }).from(comments).where(eq(comments.flagged, true)),
    db.select({ value: count() }).from(users).where(isNotNull(users.bannedAt)),
    db.select({ value: count() }).from(photos).where(eq(photos.status, 'failed')),
  ]);

  return {
    totalUsers: userCount.value,
    totalPhotos: photoCount.value,
    totalComments: commentCount.value,
    pendingReports: pendingReportCount.value,
    flaggedComments: flaggedCount.value,
    bannedUsers: bannedCount.value,
    failedPhotos: failedCount.value,
  };
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function listUsers(
  status: 'all' | 'active' | 'banned' = 'all',
  cursor?: string,
  limit?: number
): Promise<PaginatedResponse<AdminUserResponse>> {
  const pageLimit = clampLimit(limit);

  const conditions: SQL[] = [];
  if (status === 'banned') conditions.push(isNotNull(users.bannedAt));
  if (status === 'active') conditions.push(isNull(users.bannedAt));

  const cursorCond = buildCursorCondition(cursor, users.createdAt, users.id);
  if (cursorCond) conditions.push(cursorCond);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const photoCountSub = db
    .select({ userId: photos.userId, cnt: count().as('cnt') })
    .from(photos)
    .where(eq(photos.status, 'ready'))
    .groupBy(photos.userId)
    .as('photo_counts');

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      city: users.city,
      role: users.role,
      bannedAt: users.bannedAt,
      createdAt: users.createdAt,
      photoCount: sql<number>`COALESCE(${photoCountSub.cnt}, 0)`.as('photo_count'),
    })
    .from(users)
    .leftJoin(photoCountSub, eq(users.id, photoCountSub.userId))
    .where(where)
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(pageLimit + 1);

  const hasMore = rows.length > pageLimit;
  const data = rows.slice(0, pageLimit);

  const nextCursor =
    hasMore && data.length > 0
      ? encodeCursor(data[data.length - 1].createdAt, data[data.length - 1].id)
      : null;

  return {
    data: data.map((r) => ({
      id: r.id,
      email: r.email,
      username: r.username,
      displayName: r.displayName,
      city: r.city,
      role: r.role,
      bannedAt: r.bannedAt?.toISOString() ?? null,
      photoCount: Number(r.photoCount),
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: { nextCursor, hasMore },
  };
}

export async function banUser(userId: string): Promise<boolean> {
  const [updated] = await db
    .update(users)
    .set({ bannedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.bannedAt)))
    .returning({ id: users.id });
  return !!updated;
}

export async function unbanUser(userId: string): Promise<boolean> {
  const [updated] = await db
    .update(users)
    .set({ bannedAt: null })
    .where(and(eq(users.id, userId), isNotNull(users.bannedAt)))
    .returning({ id: users.id });
  return !!updated;
}

// ── Photos ───────────────────────────────────────────────────────────────────

export async function listPhotosAdmin(
  status: 'all' | 'ready' | 'failed' | 'processing' | 'reported' = 'all',
  cursor?: string,
  limit?: number
): Promise<PaginatedResponse<AdminPhotoResponse>> {
  const pageLimit = clampLimit(limit);

  const reportCountSub = db
    .select({ photoId: reports.photoId, cnt: count().as('cnt') })
    .from(reports)
    .where(eq(reports.status, 'pending'))
    .groupBy(reports.photoId)
    .as('report_counts');

  const conditions: SQL[] = [];
  if (status === 'reported') {
    conditions.push(sql`${reportCountSub.cnt} > 0`);
  } else if (status !== 'all') {
    conditions.push(eq(photos.status, status));
  }

  const cursorCond = buildCursorCondition(cursor, photos.createdAt, photos.id);
  if (cursorCond) conditions.push(cursorCond);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: photos.id,
      userId: photos.userId,
      username: users.username,
      caption: photos.caption,
      status: photos.status,
      reportCount: sql<number>`COALESCE(${reportCountSub.cnt}, 0)`.as('report_count'),
      likeCount: photos.likeCount,
      commentCount: photos.commentCount,
      createdAt: photos.createdAt,
    })
    .from(photos)
    .innerJoin(users, eq(photos.userId, users.id))
    .leftJoin(reportCountSub, eq(photos.id, reportCountSub.photoId))
    .where(where)
    .orderBy(desc(photos.createdAt), desc(photos.id))
    .limit(pageLimit + 1);

  const hasMore = rows.length > pageLimit;
  const data = rows.slice(0, pageLimit);

  const nextCursor =
    hasMore && data.length > 0
      ? encodeCursor(data[data.length - 1].createdAt, data[data.length - 1].id)
      : null;

  return {
    data: data.map((r) => ({
      id: r.id,
      userId: r.userId,
      username: r.username,
      caption: r.caption,
      status: r.status,
      reportCount: Number(r.reportCount),
      likeCount: r.likeCount,
      commentCount: r.commentCount,
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: { nextCursor, hasMore },
  };
}

export async function adminDeletePhoto(photoId: string): Promise<boolean> {
  const [updated] = await db
    .update(photos)
    .set({ status: 'deleted', updatedAt: new Date() })
    .where(and(eq(photos.id, photoId), sql`${photos.status} != 'deleted'`))
    .returning({ id: photos.id });

  if (updated) {
    await db.delete(feedScores).where(eq(feedScores.photoId, photoId));
  }

  return !!updated;
}

// ── Reports ──────────────────────────────────────────────────────────────────

export async function createReport(
  photoId: string,
  reporterId: string,
  reason: string
): Promise<{ id: string } | 'photo_not_found' | 'already_reported' | 'own_photo'> {
  const [photo] = await db
    .select({ id: photos.id, userId: photos.userId, status: photos.status })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);

  if (!photo || photo.status === 'deleted') return 'photo_not_found';
  if (photo.userId === reporterId) return 'own_photo';

  try {
    const [report] = await db
      .insert(reports)
      .values({ photoId, reporterId, reason })
      .returning({ id: reports.id });
    return { id: report.id };
  } catch (err: unknown) {
    const pgError = err as { code?: string };
    if (pgError.code === '23505') return 'already_reported';
    throw err;
  }
}

export async function listReports(
  status: 'pending' | 'reviewed' | 'dismissed' | 'all' = 'pending',
  cursor?: string,
  limit?: number
): Promise<PaginatedResponse<ReportResponse>> {
  const pageLimit = clampLimit(limit);

  const conditions: SQL[] = [];
  if (status !== 'all') conditions.push(eq(reports.status, status));

  const cursorCond = buildCursorCondition(cursor, reports.createdAt, reports.id);
  if (cursorCond) conditions.push(cursorCond);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: reports.id,
      photoId: reports.photoId,
      reporterId: reports.reporterId,
      reporterUsername: users.username,
      reason: reports.reason,
      status: reports.status,
      resolvedBy: reports.resolvedBy,
      resolvedAt: reports.resolvedAt,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .innerJoin(users, eq(reports.reporterId, users.id))
    .where(where)
    .orderBy(desc(reports.createdAt), desc(reports.id))
    .limit(pageLimit + 1);

  const hasMore = rows.length > pageLimit;
  const data = rows.slice(0, pageLimit);

  const nextCursor =
    hasMore && data.length > 0
      ? encodeCursor(data[data.length - 1].createdAt, data[data.length - 1].id)
      : null;

  return {
    data: data.map((r) => ({
      id: r.id,
      photoId: r.photoId,
      reporterId: r.reporterId,
      reporterUsername: r.reporterUsername,
      reason: r.reason,
      status: r.status as ReportResponse['status'],
      resolvedBy: r.resolvedBy,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: { nextCursor, hasMore },
  };
}

export async function resolveReport(
  reportId: string,
  adminId: string,
  newStatus: 'reviewed' | 'dismissed'
): Promise<boolean> {
  const [updated] = await db
    .update(reports)
    .set({ status: newStatus, resolvedBy: adminId, resolvedAt: new Date() })
    .where(and(eq(reports.id, reportId), eq(reports.status, 'pending')))
    .returning({ id: reports.id });
  return !!updated;
}

// ── Comments (admin) ─────────────────────────────────────────────────────────

export async function listCommentsAdmin(
  flaggedOnly: boolean,
  cursor?: string,
  limit?: number
): Promise<PaginatedResponse<AdminCommentResponse>> {
  const pageLimit = clampLimit(limit);

  const conditions: SQL[] = [];
  if (flaggedOnly) conditions.push(eq(comments.flagged, true));

  const cursorCond = buildCursorCondition(cursor, comments.createdAt, comments.id);
  if (cursorCond) conditions.push(cursorCond);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: comments.id,
      photoId: comments.photoId,
      userId: comments.userId,
      username: users.username,
      body: comments.body,
      flagged: comments.flagged,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(where)
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(pageLimit + 1);

  const hasMore = rows.length > pageLimit;
  const data = rows.slice(0, pageLimit);

  const nextCursor =
    hasMore && data.length > 0
      ? encodeCursor(data[data.length - 1].createdAt, data[data.length - 1].id)
      : null;

  return {
    data: data.map((r) => ({
      id: r.id,
      photoId: r.photoId,
      userId: r.userId,
      username: r.username,
      body: r.body,
      flagged: r.flagged,
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: { nextCursor, hasMore },
  };
}

export async function adminDeleteComment(commentId: string): Promise<boolean> {
  const [comment] = await db
    .select({ id: comments.id, photoId: comments.photoId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  if (!comment) return false;

  await db.delete(comments).where(eq(comments.id, commentId));

  await db
    .update(photos)
    .set({ commentCount: sql`GREATEST(${photos.commentCount} - 1, 0)` })
    .where(eq(photos.id, comment.photoId));

  return true;
}
