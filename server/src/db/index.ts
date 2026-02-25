import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env';
import * as schema from './schema/index';

// When DATABASE_POOL_URL is set the server is running behind PgBouncer in
// transaction-pooling mode.  Two differences from a direct connection:
//   • `prepare: false`  — prepared statements don't survive across pooled
//                         connections, so they must be disabled.
//   • Fewer app-level connections — PgBouncer multiplexes them into a
//                         smaller set of real Postgres connections.
// Migrations (db/migrate.ts) always connect via DATABASE_URL directly so
// that advisory-lock-based migration guards work correctly.
const connectionUrl = env.DATABASE_POOL_URL ?? env.DATABASE_URL;
const queryClient = postgres(connectionUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 30,
  ...(env.DATABASE_POOL_URL ? { prepare: false } : {}),
});

export const db = drizzle(queryClient, { schema });

export type DB = typeof db;

// Export schema for use in queries
export { schema };
