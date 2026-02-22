/**
 * Vitest global setup — sets required environment variables before any module
 * is imported, so that `config/env.ts` passes its Zod validation in tests.
 *
 * Values here are placeholders; real values come from .env when running against
 * actual infrastructure (integration tests).  For unit / route tests with
 * mocked services these values are never used for real I/O.
 */
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] ??= 'postgresql://imagiverse:imagiverse@localhost:5432/imagiverse';
process.env['REDIS_URL'] ??= 'redis://localhost:6379';
process.env['S3_ENDPOINT'] ??= 'http://localhost:3900';
process.env['S3_BUCKET'] ??= 'imagiverse-media';
process.env['S3_ACCESS_KEY'] ??= 'test-access-key';
process.env['S3_SECRET_KEY'] ??= 'test-secret-key-placeholder-value';
process.env['JWT_SECRET'] ??= 'test-jwt-secret-that-is-at-least-32-chars-long';
process.env['JWT_REFRESH_SECRET'] ??= 'test-refresh-secret-at-least-32-chars-long';
