import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env';
import * as schema from './schema/index';

// Create the postgres.js client (connection pool)
// max: 10 is suitable for development; tune for production with PgBouncer
const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 30,
});

export const db = drizzle(queryClient, { schema });

export type DB = typeof db;

// Export schema for use in queries
export { schema };
