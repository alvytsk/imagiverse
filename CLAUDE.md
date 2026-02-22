# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Imagiverse is a photo gallery platform. Users upload photos, browse a ranked public feed, like/comment on photos, and search for users.

Full architecture and phase roadmap live in `docs/DEVELOPMENT_PLAN.md`. The build is in **Epic M1** (scaffolding complete); M2–M9 are the remaining MVP epics.

## Monorepo Structure

```
client/    React 19 SPA (Vite 7, ESM, TypeScript)
server/    Fastify 5 API + BullMQ worker (CommonJS, TypeScript)
shared/    Zod schemas and TypeScript types used by both client and server
docker/    Docker Compose, Dockerfiles, Garage v2 config, init script
docs/      DEVELOPMENT_PLAN.md — single source of truth for architecture
```

pnpm workspaces: `pnpm install` at root installs all three packages.

## Commands

### Local development (recommended: run infra in Docker, API natively)

```bash
cp .env.example .env
pnpm install
pnpm infra:up                    # start Postgres, Redis, Garage v2
# first time only — initialise Garage bucket and access key:
docker compose -f docker/docker-compose.yml run --rm garage-init
pnpm dev:api                     # Fastify with tsx watch (hot reload)
pnpm dev:worker                  # BullMQ worker with tsx watch
cd client && pnpm dev            # Vite dev server (client only)
```

### Full stack in Docker

```bash
docker compose -f docker/docker-compose.yml up
```

### Build

```bash
pnpm build            # compiles shared + server (TypeScript → dist/)
pnpm build:client     # Vite build for the SPA
```

### Lint & format (Biome — covers server/ and shared/ only; client uses its own Biome config)

```bash
pnpm lint             # check
pnpm lint:fix         # auto-fix
pnpm format           # format only
```

### Type check

```bash
pnpm type-check                                          # checks shared + server (two tsconfig references)
pnpm exec tsc --noEmit -p client/tsconfig.json          # client separately
```

### Tests

```bash
pnpm test                                               # server unit tests (vitest run)
pnpm --filter server test:watch                         # watch mode
pnpm --filter server test:coverage
# run a single test file:
pnpm exec vitest run --project=server server/src/some.test.ts
```

### Database

```bash
# Generate migration after schema changes:
pnpm --filter server db:generate
# Apply migrations manually (server also auto-migrates on startup):
pnpm --filter server db:migrate
# Drizzle Studio (visual DB browser):
pnpm --filter server db:studio
```

## Architecture

### Request flow

```
Client (React SPA)
  → Fastify API  (server/src/server.ts)
      → Drizzle ORM  → PostgreSQL 16
      → ioredis       → Redis 7  (cache, rate-limit counters, BullMQ)
      → AWS SDK       → Garage v2 (S3-compatible object storage)
      → BullMQ enqueue → Worker process (server/src/worker.ts)
                           → Sharp (image processing)
                           → S3 (thumbnail upload)
```

### Server package layout

```
server/src/
  config/env.ts          — Zod-validated env; process.exit(1) on bad config
  server.ts              — entry: runs migrations, checks S3 bucket, registers routes
  worker.ts              — entry: BullMQ workers + health HTTP endpoint
  db/
    schema/index.ts      — Drizzle table + relation definitions (all 5 tables)
    index.ts             — pooled postgres.js client + drizzle instance (export: db)
    migrate.ts           — auto-migration runner (called from server.ts on startup)
  plugins/s3.ts          — S3 client, upload/download/delete/presign helpers, S3Keys
  modules/<feature>/
    <feature>.routes.ts  — Fastify route registration
    <feature>.service.ts — business logic (added in M2+)
    <feature>.schema.ts  — feature-specific Zod schemas (added in M2+)
    <feature>.test.ts    — Vitest tests
```

### Shared package

`shared/src/schemas/` contains Zod schemas imported by **both** client and server. When adding a new API input/output shape, define it in shared first. The server's `tsconfig.json` maps `imagiverse-shared` to `../shared/src/index.ts` via `paths`, so `tsx` and `tsc` both resolve it without a build step.

### Database schema

Five tables: `users`, `photos`, `likes`, `comments`, `feed_scores`. Key points:
- `users.search_name/user/city` are `GENERATED ALWAYS AS` Postgres columns using `immutable_unaccent(lower(...))` for case-insensitive, diacritics-insensitive trigram search. PostgreSQL's built-in `unaccent()` is `STABLE` but generated columns require `IMMUTABLE` expressions, so we wrap it with `immutable_unaccent()` — a thin SQL wrapper in the migration. These columns are declared as regular nullable `text` in Drizzle schema but populated by the DB automatically.
- `photos.status` lifecycle: `processing` → `ready` (or `failed`). Only `ready` photos appear in feeds and profiles.
- `feed_scores` is a materialized read model; scores are recalculated via BullMQ cron every 5 min (M5) using the gravity formula: `likes / (hours_since_upload + 2) ^ 1.5`.
- `photos.like_count` and `comment_count` are denormalized counters updated inline on like/comment events.

### Object storage (Garage v2)

Path convention (from `server/src/plugins/s3.ts` → `S3Keys`):
- Originals: `originals/{userId}/{photoId}.{ext}`
- Thumbnails: `thumbs/{photoId}/small|medium|large.webp`
- Avatars: `avatars/{userId}/avatar.webp`

`forcePathStyle: true` is required — Garage uses path-style S3 addressing, not virtual-hosted.

### Auth pattern (implemented in M2)

- Access token: short-lived JWT (15 min), sent as `Authorization: Bearer` header, stored in JS memory only.
- Refresh token: long-lived (7 days), stored in Redis, delivered via `HttpOnly; Secure; SameSite=Strict` cookie.
- Refresh tokens are keyed in Redis by user ID, enabling revocation on logout/password change.

### Feature module pattern (M2+)

Each feature lives in `server/src/modules/<feature>/`. Register routes as a Fastify plugin:

```typescript
// in server.ts
await server.register(import('./modules/auth/auth.routes'), { prefix: '/api' });
```

Protect routes using a `preHandler` auth middleware (added in M2) that verifies the JWT and attaches `request.user`.

### TypeScript compilation

- **Server**: CommonJS (`module: CommonJS` in `tsconfig.json`), compiled to `server/dist/` by `tsc`. Use `tsx watch` for dev.
- **Client**: ESM (`"type": "module"` in `package.json`), bundled by Vite 7.
- **Shared**: compiled to `shared/dist/` but resolved directly from source (`paths` alias) in the server during dev.

Drizzle migration files (`server/drizzle/*.sql`) are copied into the Docker image at build time and run automatically on server startup via `drizzle-orm/postgres-js/migrator`.

### Pagination

All list endpoints use cursor-based pagination (not offset). Cursor encodes `(score, id)` for the feed or `(created_at, id)` for chronological lists, base64-encoded. Response shape: `{ data: [...], pagination: { nextCursor, hasMore } }`.

### Error response shape

```json
{ "error": { "code": "SNAKE_CASE_CODE", "message": "...", "details": [{ "field": "...", "message": "..." }] } }
```

## Key conventions

- **Env validation**: all env vars go through `server/src/config/env.ts`. Never access `process.env` directly elsewhere in server code.
- **No raw SQL in route handlers**: use Drizzle query builder or `db.execute(sql\`...\`)` only in service files.
- **Text sanitization**: all user-provided text (comments, captions, bio) must be sanitized server-side with `sanitize-html` before persisting. Never trust client-side sanitization.
- **S3 keys**: always use the `S3Keys` helpers from `server/src/plugins/s3.ts`, not hand-crafted strings.
- **Migrations are forward-only**: no down migrations. Fix mistakes with a new forward migration.
