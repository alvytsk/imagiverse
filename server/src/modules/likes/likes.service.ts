import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index';
import { feedScores, likes, photos } from '../../db/schema/index';
import { invalidateFeedCache } from '../../jobs/feed-score.processor';
import { calculateFeedScore } from '../feed/feed.formula';

export async function getReadyPhoto(photoId: string) {
  const [photo] = await db
    .select({ id: photos.id, status: photos.status })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);

  if (!photo || photo.status !== 'ready') return null;
  return photo;
}

export async function likePhoto(
  userId: string,
  photoId: string
): Promise<{ created: boolean; duplicate: boolean }> {
  try {
    await db.insert(likes).values({ userId, photoId });
  } catch (err: unknown) {
    // Unique constraint violation (composite PK on userId + photoId)
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return { created: false, duplicate: true };
    }
    throw err;
  }

  // Increment denormalized counter
  await db
    .update(photos)
    .set({ likeCount: sql`${photos.likeCount} + 1` })
    .where(eq(photos.id, photoId));

  // Inline feed score recalc
  await recalcPhotoScore(photoId);

  return { created: true, duplicate: false };
}

export async function unlikePhoto(userId: string, photoId: string): Promise<boolean> {
  const deleted = await db
    .delete(likes)
    .where(and(eq(likes.userId, userId), eq(likes.photoId, photoId)))
    .returning({ visitorId: likes.userId });

  if (deleted.length === 0) return false;

  // Decrement denormalized counter (floor at 0)
  await db
    .update(photos)
    .set({ likeCount: sql`GREATEST(${photos.likeCount} - 1, 0)` })
    .where(eq(photos.id, photoId));

  // Inline feed score recalc
  await recalcPhotoScore(photoId);

  return true;
}

async function recalcPhotoScore(photoId: string): Promise<void> {
  const [photo] = await db
    .select({ likeCount: photos.likeCount, createdAt: photos.createdAt })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);

  if (!photo) return;

  const score = calculateFeedScore(photo.likeCount, photo.createdAt);
  await db
    .insert(feedScores)
    .values({ photoId, score, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: feedScores.photoId,
      set: { score, updatedAt: new Date() },
    });

  await invalidateFeedCache();
}

export async function hasUserLiked(userId: string, photoId: string): Promise<boolean> {
  const [row] = await db
    .select({ visitorId: likes.userId })
    .from(likes)
    .where(and(eq(likes.userId, userId), eq(likes.photoId, photoId)))
    .limit(1);

  return !!row;
}
