# Imagiverse

A photo gallery platform where users upload photos, browse a gravity-ranked public feed, like and comment on photos, and discover other users.

## Features

- **Photo Upload & Processing** — Upload images that are processed into three thumbnail sizes (small/medium/large WebP) by an async BullMQ worker; EXIF metadata (camera, focal length, ISO, GPS, etc.) is extracted and stored
- **Ranked Feed** — Photos scored with a gravity formula (`likes / (hours_since_upload + 2)^1.5`) recalculated every 5 minutes; supports category filter and cursor-based pagination
- **Interactions** — Like/unlike photos; threaded comments with replies; real-time notification delivery for new likes and comments
- **User Profiles** — Avatar and banner image upload; bio and city; follower-style public profiles
- **Albums** — Group photos into named albums; control visibility per album
- **Categories** — Assign photos to categories (Landscape, Portrait, Street, etc.); filter feed by category
- **Search** — Case-insensitive, diacritics-insensitive trigram search on username, display name, and city using PostgreSQL `pg_trgm` + `immutable_unaccent`
- **Admin Panel** — Dashboard stats, user management (ban/unban), photo and comment moderation, report queue
- **Observability** — Prometheus metrics, Grafana dashboards, per-stage thumbnail timing, feed cache hit/miss tracking

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 7, TanStack Router, TanStack Query, Zustand, Tailwind CSS |
| **Backend** | Fastify 5, Drizzle ORM, TypeScript (CommonJS) |
| **Worker** | BullMQ, Sharp (image resize), exifr (EXIF extraction) |
| **Database** | PostgreSQL 16 |
| **Cache / Queue** | Redis 7 |
| **Object Storage** | Garage v2 (S3-compatible) |
| **Monitoring** | Prometheus + prom-client, Grafana 11 |
| **Testing** | Vitest (unit + integration), Playwright (E2E), Testcontainers |
| **Tooling** | pnpm workspaces, Biome (lint/format), tsx (dev hot-reload) |

## Architecture

```
Browser
  │  HTTP
  ↓
nginx (port 80)  ←─ serves React SPA, proxies /api/* to Fastify
  │
  ↓
Fastify API  (port 3000 internal)
  ├─→ PostgreSQL 16  — users, photos, likes, comments, albums, feed_scores
  ├─→ Redis 7        — JWT refresh tokens, rate-limit counters, BullMQ queues
  ├─→ Garage S3      — originals, thumbnails, avatars, banners
  └─→ BullMQ enqueue ──────────────────────────────────────┐
                                                            ↓
Worker process  (port 3001 — health + /metrics)
  ├─→ generate-thumbnails  → Sharp resize → S3 upload → DB update
  └─→ recalc-feed-score    → gravity formula → feed_scores table (cron 5 min)

Prometheus  (port 9090)  ─scrapes─→  api:3000/metrics
                         ─scrapes─→  worker:3001/metrics
Grafana     (port 3003)  ─queries──→  Prometheus
```

## Monorepo Structure

```
imagiverse/
├── client/          React 19 SPA (Vite 7, ESM, TypeScript)
├── server/          Fastify API + BullMQ worker (CommonJS, TypeScript)
│   ├── src/
│   │   ├── config/env.ts          Zod-validated env; exits on bad config
│   │   ├── server.ts              API entry point (migrations, routes, metrics)
│   │   ├── worker.ts              Worker entry point (BullMQ + health HTTP)
│   │   ├── db/                    Drizzle schema, migrations, pooled client
│   │   ├── jobs/                  BullMQ processors and queue definitions
│   │   ├── lib/                   Shared helpers (logger, metrics)
│   │   ├── modules/<feature>/     Route + service + schema + tests per feature
│   │   └── plugins/               s3, redis Fastify plugins
│   └── drizzle/     Forward-only SQL migrations
├── shared/          Zod schemas + TypeScript types (used by both sides)
├── docker/          Docker Compose, Dockerfiles, Prometheus, Grafana configs
├── docs/            DEVELOPMENT_PLAN.md — architecture & phase roadmap
└── e2e/             Playwright end-to-end tests
```

---

## Quick Start

### Local Development (Recommended)

Run infrastructure in Docker; API and SPA natively for hot reload.

```bash
# 1. Clone and install
pnpm install

# 2. Copy and edit environment variables
cp .env.example .env
# → After running garage-init (step 4), paste the generated S3 keys here

# 3. Start Postgres, Redis, Garage
pnpm infra:up

# 4. First-time Garage setup (creates bucket + access key)
docker compose -f docker/docker-compose.yml run --rm garage-init
# Outputs: S3_ACCESS_KEY and S3_SECRET_KEY → paste into .env

# 5. In three separate terminals:
pnpm dev:api        # Fastify API  → http://localhost:3000
pnpm dev:worker     # BullMQ worker → health at http://localhost:3001/health
cd client && pnpm dev  # Vite SPA  → http://localhost:5173
```

### Full Stack in Docker

```bash
docker compose -f docker/docker-compose.yml up
# Client (nginx)  → http://localhost
# Prometheus      → http://localhost:9090
# Grafana         → http://localhost:3003  (admin / admin)
```

### Seed Test Data

```bash
pnpm seed   # 100 users, 1 000 photos, likes, comments, albums
# Admin user: user1@example.com / Password1!
```

---

## Commands

### Infrastructure

| Command | Description |
|---|---|
| `pnpm infra:up` | Start Postgres, Redis, Garage v2 in Docker |
| `pnpm infra:down` | Stop infrastructure containers |
| `docker compose … run --rm garage-init` | First-time Garage bucket + key setup |

### Development

| Command | Description |
|---|---|
| `pnpm dev:api` | Fastify API with tsx watch (hot reload) |
| `pnpm dev:worker` | BullMQ worker with tsx watch |
| `cd client && pnpm dev` | Vite dev server |

### Build

| Command | Description |
|---|---|
| `pnpm build` | Compile shared + server (TypeScript → `dist/`) |
| `pnpm build:client` | Vite production build |
| `pnpm docker:build` | Build API, Worker, and Client Docker images |

### Testing

| Command | Description |
|---|---|
| `pnpm test` | 134 unit tests (Vitest, mocked deps) |
| `pnpm --filter server test:watch` | Unit tests in watch mode |
| `pnpm --filter server test:coverage` | Coverage report |
| `pnpm test:integration` | Integration tests via Testcontainers (real Postgres + Redis) |
| `pnpm test:e2e` | Playwright E2E — register → upload → feed → profile → search |
| `pnpm test:e2e:ui` | Playwright UI runner |

> Integration tests require Docker. Each suite spins up fresh Postgres 16 + Redis 7 containers, applies migrations, and uses `app.inject()` (no live HTTP server).

### Database

| Command | Description |
|---|---|
| `pnpm --filter server db:generate` | Generate migration after schema changes |
| `pnpm --filter server db:migrate` | Apply pending migrations |
| `pnpm --filter server db:studio` | Drizzle Studio visual browser |
| `pnpm seed` | Seed 100 users + 1 000 photos |

### Code Quality

| Command | Description |
|---|---|
| `pnpm lint` | Biome check (server + shared) |
| `pnpm lint:fix` | Biome auto-fix |
| `pnpm format` | Biome format |
| `pnpm type-check` | tsc on shared + server |
| `pnpm exec tsc --noEmit -p client/tsconfig.json` | tsc on client |

---

## Configuration

All variables are validated at startup by `server/src/config/env.ts` (Zod schema). The process exits with an error if required variables are missing or malformed. Never access `process.env` directly in application code.

Copy `.env.example` to `.env`:

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | yes | `development` \| `production` |
| `API_PORT` | yes | Fastify listen port (default `3000`) |
| `API_HOST` | yes | Fastify listen host (default `0.0.0.0`) |
| `DATABASE_URL` | yes | Direct PostgreSQL connection (used by migrations + API) |
| `DATABASE_POOL_URL` | no | PgBouncer URL — when set, API uses this with `prepare: false` |
| `REDIS_URL` | yes | Redis connection string |
| `S3_ENDPOINT` | yes | Garage / S3 endpoint URL |
| `S3_PUBLIC_ENDPOINT` | no | Public-facing S3 URL (for pre-signed URLs) |
| `S3_BUCKET` | yes | Bucket name |
| `S3_ACCESS_KEY` | yes | S3 access key (generated by `garage-init`) |
| `S3_SECRET_KEY` | yes | S3 secret key (generated by `garage-init`) |
| `S3_REGION` | yes | Region string (Garage ignores it, use `us-east-1`) |
| `S3_USE_SSL` | yes | `true` \| `false` |
| `JWT_SECRET` | yes | HS256 signing key for access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | yes | Signing key for refresh tokens (min 32 chars) |
| `JWT_ACCESS_EXPIRES_IN` | yes | Access token TTL (e.g. `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | yes | Refresh token TTL (e.g. `7d`) |
| `WORKER_PORT` | yes | Worker health/metrics HTTP port (default `3001`) |
| `WORKER_CONCURRENCY` | yes | Parallel thumbnail jobs (default `3`) |
| `GARAGE_ADMIN_TOKEN` | no | Garage admin API token (only for `garage-init` script) |
| `GARAGE_ADMIN_URL` | no | Garage admin API URL (only for `garage-init` script) |

> **Production:** generate secrets with `openssl rand -hex 32`. Set `DATABASE_POOL_URL` to your PgBouncer address.

---

## API Reference

All endpoints return `application/json`. Error shape:
```json
{ "error": { "code": "SNAKE_CASE_CODE", "message": "...", "details": [{ "field": "f", "message": "..." }] } }
```

Authenticated endpoints require `Authorization: Bearer <accessToken>`.

Paginated responses use cursor-based pagination:
```json
{ "data": [...], "pagination": { "nextCursor": "base64…", "hasMore": true } }
```

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Register; returns `accessToken` + sets refresh cookie |
| POST | `/api/auth/login` | — | Login; returns `accessToken` + sets refresh cookie |
| POST | `/api/auth/refresh` | cookie | Rotate refresh token; returns new `accessToken` |
| POST | `/api/auth/logout` | cookie | Revoke refresh token |

### Photos

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/photos` | ✓ | Upload photo (multipart); enqueues thumbnail job |
| GET | `/api/photos/:id` | optional | Photo detail — includes EXIF, like status |
| PATCH | `/api/photos/:id` | owner | Update caption |
| PATCH | `/api/photos/:id/visibility` | owner | Toggle `public` / `private` |
| PATCH | `/api/photos/:id/category` | owner | Assign category |
| DELETE | `/api/photos/:id` | owner | Soft-delete photo |
| POST | `/api/photos/:id/report` | ✓ | Report photo for moderation |

### Feed

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/feed` | optional | Gravity-ranked feed; `?cursor=` for pagination, `?category=slug` to filter |

### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/users/me` | ✓ | Own profile |
| PATCH | `/api/users/me` | ✓ | Update displayName, bio, city |
| POST | `/api/users/me/avatar` | ✓ | Upload avatar (resized to WebP) |
| DELETE | `/api/users/me/avatar` | ✓ | Remove avatar |
| POST | `/api/users/me/banner` | ✓ | Upload banner image |
| DELETE | `/api/users/me/banner` | ✓ | Remove banner |
| GET | `/api/users/search` | optional | Trigram search — `?q=query` |
| GET | `/api/users/:id` | optional | Public profile |
| GET | `/api/users/:id/photos` | optional | User's photos (cursor-paginated) |
| GET | `/api/users/:id/albums` | optional | User's albums |

### Likes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/photos/:photoId/like` | ✓ | Like photo |
| DELETE | `/api/photos/:photoId/like` | ✓ | Unlike photo |

### Comments

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/photos/:photoId/comments` | ✓ | Create top-level comment or reply (`parentId`) |
| GET | `/api/photos/:photoId/comments` | optional | Paginated comments |
| GET | `/api/comments/:id/replies` | optional | Paginated replies to a comment |
| DELETE | `/api/comments/:id` | owner | Delete comment |

### Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/notifications` | ✓ | Paginated notifications |
| GET | `/api/notifications/unread-count` | ✓ | Unread count |
| PATCH | `/api/notifications/read-all` | ✓ | Mark all as read |
| PATCH | `/api/notifications/:id/read` | ✓ | Mark one as read |

### Albums

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/albums` | ✓ | Create album |
| GET | `/api/albums/:albumId` | optional | Album detail with photos |
| PATCH | `/api/albums/:albumId` | owner | Update title/description |
| DELETE | `/api/albums/:albumId` | owner | Delete album |
| POST | `/api/albums/:albumId/photos` | ✓ | Add photo to album |
| DELETE | `/api/albums/:albumId/photos/:photoId` | ✓ | Remove photo from album |

### Categories

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/categories` | — | All categories with display order |

### Admin (admin role required)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/stats` | Platform dashboard stats |
| GET | `/api/admin/users` | List users with filters |
| PATCH | `/api/admin/users/:id/ban` | Ban user |
| PATCH | `/api/admin/users/:id/unban` | Unban user |
| GET | `/api/admin/photos` | List photos with status filter |
| DELETE | `/api/admin/photos/:id` | Force-delete photo |
| GET | `/api/admin/reports` | Report queue |
| PATCH | `/api/admin/reports/:id` | Resolve report |
| GET | `/api/admin/comments` | List comments |
| DELETE | `/api/admin/comments/:id` | Delete comment |

### Health & Metrics

| Method | Path | Description |
|---|---|---|
| GET | `/api/health/live` | Liveness — always 200 if process is running |
| GET | `/api/health/ready` | Readiness — verifies Postgres, Redis, and S3 connectivity |
| GET | `/metrics` | Prometheus text format (unprotected; restrict in production) |

---

## Database Schema

Six tables; all IDs are UUIDs.

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id`, `email`, `username`, `role`, `banned_at` | `role`: `user` \| `admin`. `search_name/user/city` are `GENERATED ALWAYS AS` columns using `immutable_unaccent(lower(...))` for trigram search |
| `categories` | `id`, `name`, `slug`, `display_order` | Seeded; managed by admin |
| `photos` | `id`, `user_id`, `status`, `exif_data` (JSONB) | `status`: `processing` → `ready` (or `failed`). Only `ready` photos appear in feeds |
| `likes` | `(user_id, photo_id)` composite PK | `like_count` is denormalized on `photos` |
| `comments` | `id`, `photo_id`, `parent_id` | Threaded; `comment_count` is denormalized on `photos` |
| `albums` | `id`, `user_id`, `title` | Many-to-many with photos via `album_photos` join table |
| `notifications` | `id`, `recipient_id`, `type`, `read` | Types: `like`, `comment`, `reply` |
| `feed_scores` | `(photo_id)` PK, `score` | Materialized gravity scores; recalculated every 5 min by worker cron |

**Object storage key convention** (always use `S3Keys` helpers — never build strings manually):

```
originals/{userId}/{photoId}.{ext}
thumbs/{photoId}/small.webp
thumbs/{photoId}/medium.webp
thumbs/{photoId}/large.webp
avatars/{userId}/avatar.webp
banners/{userId}/banner.webp
```

---

## Authentication

- **Access token** — Short-lived JWT (15 min), signed with `JWT_SECRET`, sent as `Authorization: Bearer` header, stored in JS memory only (never localStorage)
- **Refresh token** — Long-lived (7 days), signed with `JWT_REFRESH_SECRET`, stored in Redis keyed by `userId` (enabling single-session revocation), delivered via `HttpOnly; Secure; SameSite=Strict` cookie
- **Rotation** — Each `POST /api/auth/refresh` issues a new pair and revokes the old refresh token
- **Rate limiting** — 300 requests / minute per IP via `@fastify/rate-limit` backed by Redis

---

## Observability

### Metrics

The API (`/metrics`) and worker (`/metrics`) both expose Prometheus text format.

**Custom metrics** (`server/src/lib/metrics.ts`):

| Metric | Type | Labels | Description |
|---|---|---|---|
| `http_request_duration_seconds` | histogram | `method`, `route`, `status_code` | HTTP request duration |
| `bullmq_jobs_total` | counter | `queue`, `status` | Jobs processed (completed/failed) |
| `bullmq_jobs_duration_seconds` | histogram | `queue` | Job processing duration |
| `bullmq_jobs_waiting` | gauge | `queue` | Jobs currently waiting |
| `feed_cache_hits_total` | counter | — | Feed Redis cache hits |
| `feed_cache_misses_total` | counter | — | Feed Redis cache misses |

**Default Node.js metrics** (via `prom-client collectDefaultMetrics`):
event loop lag (p50/p90/p99), V8 heap size, GC duration by kind, process CPU, resident memory, open file descriptors, active handles.

**Recording rules** (`docker/prometheus/recording_rules.yml`):

| Name | Description |
|---|---|
| `job:http_request_error_rate:ratio5m` | 5xx fraction per job (5 min window) |
| `job:http_request_duration_p95:seconds5m` | p95 latency per job (5 min window) |
| `job:feed_cache_hit_ratio:ratio5m` | Cache hit fraction (5 min window) |
| `queue:bullmq_job_failure_rate:ratio1h` | Job failure fraction per queue (1 h window) |

### Alert Rules (`docker/prometheus/alerts.yml`)

| Alert | Condition | For | Severity |
|---|---|---|---|
| `ApiHighErrorRate` | 5xx > 5% of requests | 5 min | critical |
| `FeedHighP95Latency` | Feed p95 > 300 ms | 5 min | warning |
| `BullMQQueueBacklog` | Waiting jobs > 1 000 | 10 min | warning |
| `BullMQHighFailureRate` | Failure rate > 10% (1 h window) | 5 min | critical |
| `ServiceDown` | Scrape target unreachable | 1 min | critical |
| `NodeEventLoopLagHigh` | Event loop p99 > 100 ms | 5 min | warning |
| `NodeHeapNearLimit` | Heap used/total > 90% | 5 min | warning |

### Grafana Dashboard

Auto-provisioned at startup. Open [http://localhost:3003](http://localhost:3003) (admin / admin).

The **Imagiverse Overview** dashboard has four collapsible sections:
- **HTTP API** — stat cards (req/min, error rate, p95, cache hit ratio), request rate by status class, latency percentiles (p50/90/95/99), top-10 routes, cache hit/miss rate
- **BullMQ Jobs** — stat cards, job throughput by queue + status, job duration percentiles, waiting bar gauge
- **Node.js Runtime** — event loop lag p50/90/99, V8 heap used vs total (total as dashed line), process CPU, GC time by kind
- **Service Health** — live UP/DOWN table for all Prometheus scrape targets

---

## Testing

### Unit Tests (`pnpm test`)

134 tests across all feature modules. Dependencies are mocked (database, Redis, S3). No Docker required.

```bash
pnpm test
pnpm --filter server test:watch
pnpm exec vitest run server/src/modules/feed/feed.service.test.ts
```

### Integration Tests (`pnpm test:integration`)

Real Postgres 16 + Redis 7 via Testcontainers. Fresh migrated database per suite. S3 is mocked. Uses `app.inject()` (no live HTTP).

```bash
pnpm test:integration   # requires Docker
```

Key files: `server/vitest.integration.config.ts`, `server/src/test-helpers/`.

### E2E Tests (`pnpm test:e2e`)

Playwright (Chromium). Full happy path: register → upload → feed → photo detail → profile → search → logout.

```bash
# Prerequisites — all running:
pnpm infra:up && pnpm dev:api && pnpm dev:worker
cd client && pnpm dev

pnpm test:e2e
pnpm test:e2e:ui   # interactive mode
```

---

## Docker Reference

```bash
pnpm docker:build
docker compose -f docker/docker-compose.yml up
docker compose -f docker/docker-compose.yml run --rm garage-init  # first time only
```

**Service ports when running full stack:**

| Service | Host Port | Notes |
|---|---|---|
| nginx (client + API proxy) | 80 | React SPA; `/api/*` → Fastify |
| Worker health/metrics | 3001 | `/health`, `/metrics` |
| PostgreSQL | 5432 | Direct access |
| Redis | 6379 | Direct access |
| Garage S3 API | 3900 | `forcePathStyle: true` required |
| Garage admin API | 3902 | Used by `garage-init` script |
| Prometheus | 9090 | Metrics UI + alert rules |
| Grafana | 3003 | Dashboard UI (admin / admin) |

---

## Admin Access

After seeding, log in as **user1@example.com** / **Password1!** and open **Admin Panel** from the user menu.

Grant admin to any existing user:
```bash
# Drizzle Studio
pnpm --filter server db:studio
# → users table → set role = 'admin'

# Direct SQL
psql $DATABASE_URL -c "UPDATE users SET role = 'admin' WHERE email = 'you@example.com';"
```

Re-login after the change.

---

## Key Conventions

- **Env validation** — All env vars through `server/src/config/env.ts`. Never access `process.env` elsewhere.
- **S3 keys** — Always use `S3Keys` helpers from `server/src/plugins/s3.ts`.
- **Text sanitization** — All user-supplied text (comments, captions, bio) sanitized server-side with `sanitize-html` before persisting.
- **Migrations** — Forward-only; no down migrations. Fix mistakes with a new migration.
- **Pagination** — Cursor-based (not offset). Cursor encodes `(score, id)` or `(created_at, id)`, base64-encoded.
- **Feature modules** — `server/src/modules/<feature>/` with `*.routes.ts`, `*.service.ts`, `*.schema.ts`, `*.test.ts`, `*.integration.test.ts`.
- **PgBouncer** — Set `DATABASE_POOL_URL` for transaction-mode pooling in production. Migrations always use `DATABASE_URL` directly (advisory locks need a persistent session).

---

## Project Status

| Epic | Status |
|---|---|
| MVP (M1–M9) | ✅ Complete |
| V1.1 Production Hardening | ✅ Complete |
| V1.3 Notifications | ✅ Complete |
| V1.6 Observability | ✅ Complete |
| V1.2 Admin & Moderation | In backlog |
| V1.4 UX Polish | In backlog |
| V1.5 Performance | In backlog |
| V1.7 Security Hardening | In backlog |

Full architecture and phase breakdown: [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md)

---

## Contributing

1. Branch from `main`
2. Write tests for new functionality
3. Ensure all tests pass: `pnpm test && pnpm test:integration`
4. Run quality checks: `pnpm lint:fix && pnpm type-check`
5. Open a pull request with a clear description

---

## License

MIT
