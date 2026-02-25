import { and, desc, eq, lt, or, type SQL, sql } from 'drizzle-orm';
import type {
  NotificationPayload,
  NotificationResponse,
  NotificationType,
  PaginatedResponse,
} from 'imagiverse-shared';
import { db } from '../../db/index';
import { notifications } from '../../db/schema/index';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

// ── Cursor encoding/decoding ─────────────────────────────────────────────────

interface NotificationCursor {
  createdAt: string;
  id: string;
}

function encodeCursor(createdAt: Date, id: string): string {
  const payload: NotificationCursor = { createdAt: createdAt.toISOString(), id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor: string): NotificationCursor | null {
  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof payload.createdAt === 'string' && typeof payload.id === 'string') {
      return payload as NotificationCursor;
    }
    return null;
  } catch {
    return null;
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createNotification(
  userId: string,
  type: NotificationType,
  payload: NotificationPayload
): Promise<void> {
  // No self-notifications
  if (userId === payload.actorId) return;

  await db.insert(notifications).values({ userId, type, payload });
}

export async function listNotifications(
  userId: string,
  cursor?: string,
  limit?: number
): Promise<PaginatedResponse<NotificationResponse>> {
  const pageLimit = Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);

  // Build cursor condition (newest-first: created_at DESC, id DESC)
  let cursorCondition: SQL | undefined;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      const cursorDate = new Date(decoded.createdAt);
      cursorCondition = or(
        lt(notifications.createdAt, cursorDate),
        and(eq(notifications.createdAt, cursorDate), lt(notifications.id, decoded.id))
      );
    }
  }

  const whereConditions = cursorCondition
    ? and(eq(notifications.userId, userId), cursorCondition)
    : eq(notifications.userId, userId);

  const rows = await db
    .select()
    .from(notifications)
    .where(whereConditions)
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
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
      type: row.type as NotificationType,
      payload: row.payload as NotificationPayload,
      read: row.read,
      createdAt: row.createdAt.toISOString(),
    })),
    pagination: { nextCursor, hasMore },
  };
}

export async function getUnreadCount(userId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));

  return result?.count ?? 0;
}

export async function markAsRead(id: string, userId: string): Promise<'updated' | 'not_found'> {
  const updated = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });

  return updated.length > 0 ? 'updated' : 'not_found';
}

export async function markAllAsRead(userId: string): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
    .returning({ id: notifications.id });

  return updated.length;
}
