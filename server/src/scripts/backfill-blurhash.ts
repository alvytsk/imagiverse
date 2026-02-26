/**
 * Backfill blurhash for existing photos that don't have one.
 *
 * Downloads the small thumbnail, resizes to 32×32, encodes blurhash,
 * and updates the DB row. Processes in batches of 10.
 *
 * Usage: pnpm exec tsx server/src/scripts/backfill-blurhash.ts
 */
import '../load-env';

import { encode } from 'blurhash';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import { env } from '../config/env';
import { photos } from '../db/schema/index';
import { downloadObject } from '../plugins/s3';

const BATCH_SIZE = 10;
const BLURHASH_SIZE = 32;

async function main() {
  const client = postgres(env.DATABASE_URL, { max: 5 });
  const db = drizzle(client);

  let processed = 0;
  let failed = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await db
      .select({
        id: photos.id,
        thumbSmallKey: photos.thumbSmallKey,
      })
      .from(photos)
      .where(
        and(
          eq(photos.status, 'ready'),
          isNull(photos.blurhash),
        ),
      )
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    await Promise.all(
      batch.map(async (photo) => {
        if (!photo.thumbSmallKey) {
          console.warn(`[SKIP] photo ${photo.id} — no small thumbnail`);
          return;
        }

        try {
          const thumbBuffer = await downloadObject(photo.thumbSmallKey);
          const { data: pixels, info } = await sharp(thumbBuffer)
            .resize(BLURHASH_SIZE, BLURHASH_SIZE, { fit: 'fill' })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

          const blurhash = encode(
            new Uint8ClampedArray(pixels),
            info.width,
            info.height,
            4,
            3,
          );

          await db
            .update(photos)
            .set({ blurhash, updatedAt: new Date() })
            .where(eq(photos.id, photo.id));

          processed++;
          console.log(`[OK] photo ${photo.id} → ${blurhash}`);
        } catch (err) {
          failed++;
          console.error(`[ERR] photo ${photo.id}:`, (err as Error).message);
        }
      }),
    );
  }

  console.log(`\nDone. Processed: ${processed}, Failed: ${failed}`);
  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
