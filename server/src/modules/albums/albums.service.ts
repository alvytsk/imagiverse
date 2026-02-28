import { and, count, desc, eq } from 'drizzle-orm';
import type { AlbumResponse, ExifData, PhotoResponse } from 'imagiverse-shared';
import sanitizeHtml from 'sanitize-html';
import { db } from '../../db/index';
import { albumPhotos, albums, photos } from '../../db/schema/index';
import { getPresignedDownloadUrl } from '../../plugins/s3';

const PRESIGNED_URL_EXPIRY = 3600;

function sanitizeText(text: string): string {
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
}

export async function createAlbum(
  userId: string,
  name: string,
  description?: string
): Promise<AlbumResponse> {
  const [album] = await db
    .insert(albums)
    .values({
      userId,
      name: sanitizeText(name),
      description: description ? sanitizeText(description) : null,
    })
    .returning();

  return {
    id: album.id,
    userId: album.userId,
    name: album.name,
    description: album.description,
    photoCount: 0,
    coverUrl: null,
    createdAt: album.createdAt.toISOString(),
    updatedAt: album.updatedAt.toISOString(),
  };
}

export async function getUserAlbums(userId: string): Promise<AlbumResponse[]> {
  const rows = await db
    .select()
    .from(albums)
    .where(eq(albums.userId, userId))
    .orderBy(desc(albums.updatedAt));

  return Promise.all(rows.map(buildAlbumResponse));
}

export async function getAlbumById(albumId: string) {
  const [album] = await db.select().from(albums).where(eq(albums.id, albumId)).limit(1);
  return album ?? null;
}

async function buildAlbumResponse(album: typeof albums.$inferSelect): Promise<AlbumResponse> {
  const [countRow] = await db
    .select({ value: count() })
    .from(albumPhotos)
    .where(eq(albumPhotos.albumId, album.id));

  // Get cover photo (most recently added)
  let coverUrl: string | null = null;
  const [latestEntry] = await db
    .select({ thumbSmallKey: photos.thumbSmallKey })
    .from(albumPhotos)
    .innerJoin(photos, eq(albumPhotos.photoId, photos.id))
    .where(eq(albumPhotos.albumId, album.id))
    .orderBy(desc(albumPhotos.addedAt))
    .limit(1);

  if (latestEntry?.thumbSmallKey) {
    coverUrl = await getPresignedDownloadUrl(latestEntry.thumbSmallKey, PRESIGNED_URL_EXPIRY);
  }

  return {
    id: album.id,
    userId: album.userId,
    name: album.name,
    description: album.description,
    photoCount: countRow.value,
    coverUrl,
    createdAt: album.createdAt.toISOString(),
    updatedAt: album.updatedAt.toISOString(),
  };
}

export async function updateAlbum(
  albumId: string,
  userId: string,
  input: { name?: string; description?: string | null }
): Promise<AlbumResponse | null> {
  const album = await getAlbumById(albumId);
  if (!album || album.userId !== userId) return null;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = sanitizeText(input.name);
  if (input.description !== undefined) {
    updates.description = input.description != null ? sanitizeText(input.description) : null;
  }

  const [updated] = await db.update(albums).set(updates).where(eq(albums.id, albumId)).returning();

  return buildAlbumResponse(updated);
}

export async function deleteAlbum(albumId: string, userId: string): Promise<boolean> {
  const album = await getAlbumById(albumId);
  if (!album || album.userId !== userId) return false;

  await db.delete(albums).where(eq(albums.id, albumId));
  return true;
}

export async function addPhotoToAlbum(
  albumId: string,
  photoId: string,
  userId: string
): Promise<'added' | 'not_found' | 'forbidden' | 'already_exists'> {
  const album = await getAlbumById(albumId);
  if (!album) return 'not_found';
  if (album.userId !== userId) return 'forbidden';

  const [photo] = await db
    .select({ id: photos.id, userId: photos.userId })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);
  if (!photo || photo.userId !== userId) return 'not_found';

  const [existing] = await db
    .select({ albumId: albumPhotos.albumId })
    .from(albumPhotos)
    .where(and(eq(albumPhotos.albumId, albumId), eq(albumPhotos.photoId, photoId)))
    .limit(1);

  if (existing) return 'already_exists';

  await db.insert(albumPhotos).values({ albumId, photoId });
  await db.update(albums).set({ updatedAt: new Date() }).where(eq(albums.id, albumId));

  return 'added';
}

export async function removePhotoFromAlbum(
  albumId: string,
  photoId: string,
  userId: string
): Promise<boolean> {
  const album = await getAlbumById(albumId);
  if (!album || album.userId !== userId) return false;

  const result = await db
    .delete(albumPhotos)
    .where(and(eq(albumPhotos.albumId, albumId), eq(albumPhotos.photoId, photoId)))
    .returning({ albumId: albumPhotos.albumId });

  return result.length > 0;
}

export async function getAlbumPhotos(albumId: string): Promise<PhotoResponse[]> {
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
      likeCount: photos.likeCount,
      exifData: photos.exifData,
      commentCount: photos.commentCount,
      createdAt: photos.createdAt,
      updatedAt: photos.updatedAt,
    })
    .from(albumPhotos)
    .innerJoin(photos, eq(albumPhotos.photoId, photos.id))
    .where(eq(albumPhotos.albumId, albumId))
    .orderBy(desc(albumPhotos.addedAt));

  return Promise.all(
    rows.map(async (row) => {
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
        exifData: (row.exifData as ExifData) ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    })
  );
}
