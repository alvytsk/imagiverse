/**
 * Backfill EXIF data for existing photos that don't have it.
 *
 * Downloads the original from S3, extracts EXIF metadata using Sharp + exif-reader,
 * and updates the DB row. Processes in batches of 50.
 *
 * Usage: pnpm exec tsx server/src/scripts/backfill-exif.ts
 */
import '../load-env';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import { env } from '../config/env';
import { photos } from '../db/schema/index';
import { extractCuratedExif } from '../lib/exif';
import { downloadObject } from '../plugins/s3';

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const client = postgres(env.DATABASE_URL, { max: 5 });
  const db = drizzle(client);

  // Count total photos to process
  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(photos)
    .where(and(eq(photos.status, 'ready'), isNull(photos.exifData)));

  const total = countRow?.count ?? 0;
  console.log(`Found ${total} photos without EXIF data`);

  if (total === 0) {
    console.log('Nothing to do.');
    await client.end();
    process.exit(0);
  }

  let processed = 0;
  let withExif = 0;
  let noExif = 0;
  let failed = 0;

  while (true) {
    const batch = await db
      .select({
        id: photos.id,
        originalKey: photos.originalKey,
      })
      .from(photos)
      .where(and(eq(photos.status, 'ready'), isNull(photos.exifData)))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    for (const photo of batch) {
      try {
        const originalBuffer = await downloadObject(photo.originalKey);
        const metadata = await sharp(originalBuffer).metadata();

        let exifData = null;
        if (metadata.exif) {
          try {
            exifData = extractCuratedExif(metadata.exif);
          } catch {
            // EXIF parsing failed — store empty object to mark as processed
          }
        }

        // Store extracted data, or skip update if no EXIF found (leaves null for re-processing).
        if (exifData) {
          await db
            .update(photos)
            .set({
              exifData,
              updatedAt: new Date(),
            })
            .where(eq(photos.id, photo.id));
        }

        processed++;
        if (exifData) {
          withExif++;
          console.log(
            `[OK] ${photo.id} → ${exifData.cameraModel ?? 'unknown camera'} (${processed}/${total})`
          );
        } else {
          noExif++;
          console.log(`[NO-EXIF] ${photo.id} (${processed}/${total})`);
        }
      } catch (err) {
        failed++;
        processed++;
        console.error(`[ERR] ${photo.id}: ${(err as Error).message} (${processed}/${total})`);

        // Mark as processed with empty object to avoid re-processing
        try {
          await db
            .update(photos)
            .set({ exifData: {}, updatedAt: new Date() })
            .where(eq(photos.id, photo.id));
        } catch {
          // ignore secondary error
        }
      }
    }

    // Brief delay between batches
    if (batch.length === BATCH_SIZE) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(
    `\nDone. Total: ${processed}, With EXIF: ${withExif}, No EXIF: ${noExif}, Failed: ${failed}`
  );
  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
