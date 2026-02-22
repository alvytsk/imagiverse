import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../config/env';

/**
 * Runs all pending Drizzle migrations.
 * Uses a separate single-connection client (not the pool) as recommended by Drizzle.
 * Called once during server startup before accepting requests.
 */
export async function runMigrations(): Promise<void> {
  const migrationClient = postgres(env.DATABASE_URL, { max: 1 });

  try {
    const db = drizzle(migrationClient);
    // Migrations folder: server/drizzle/ (relative to this file's compiled location)
    const migrationsFolder = path.join(__dirname, '../../drizzle');

    await migrate(db, { migrationsFolder });
  } finally {
    await migrationClient.end();
  }
}
