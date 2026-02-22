# Imagiverse — Full-Stack Development Plan

> **Author role:** Software Architect / Tech Lead
> **Date:** 2026-02-22
> **Status:** Draft for review

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Phase 0 — Requirements Clarification & Backend Selection](#2-phase-0--requirements-clarification--backend-selection)
3. [Architecture Overview](#3-architecture-overview)
4. [Data Model](#4-data-model)
5. [API Design](#5-api-design)
6. [Thumbnail / Preview Generation Pipeline](#6-thumbnail--preview-generation-pipeline)
7. [Feed Ranking Formula](#7-feed-ranking-formula)
8. [User Search](#8-user-search)
9. [Security](#9-security)
10. [Scalability](#10-scalability)
11. [Observability](#11-observability)
12. [Testing Strategy](#12-testing-strategy)
13. [DevOps & Environments](#13-devops--environments)
14. [Phase-Based Roadmap](#14-phase-based-roadmap)
15. [Risks & Mitigations](#15-risks--mitigations)

---

## 1. Executive Summary

Imagiverse is a photo gallery platform where users upload photos, browse a public
ranked feed, like and comment on photos, and search for other users. The tech stack:

| Layer | Choice |
|---|---|
| **Frontend** | React 19 SPA (Vite, TypeScript, TanStack Router, TanStack Query, Zustand) |
| **Backend** | Node.js with **Fastify** + TypeScript (selected in Phase 0 below) |
| **Primary DB** | PostgreSQL 16 |
| **Cache / Sessions** | Redis 7 |
| **Search** | Postgres `pg_trgm` + `unaccent` (MVP); Elasticsearch (v2) |
| **Object Storage** | S3-compatible (Garage v2 for dev/prod) |
| **Job Queue** | BullMQ (Redis-backed) |
| **Auth** | JWT access tokens (short-lived) + HTTP-only refresh cookie |
| **Containerization** | Docker + Docker Compose (dev), Kubernetes-ready Dockerfiles (prod) |

Target: start with a few thousand users, grow to hundreds of thousands.

---

## 2. Phase 0 — Requirements Clarification & Backend Selection

### 2.1 Open Requirements to Confirm

| # | Question | Default Assumption |
|---|---|---|
| 1 | Max photo file size? | 20 MB |
| 2 | Accepted formats? | JPEG, PNG, WebP, HEIC |
| 3 | Delete own photo? Edit caption? | Yes / Yes |
| 4 | Nested comments or flat? | Flat (MVP), threaded (v2) |
| 5 | Notifications (likes/comments)? | Not in MVP; v1 adds in-app; v2 adds push/email |
| 6 | Admin panel / moderation UI? | Basic admin in v1 |
| 7 | i18n / l10n? | English-only MVP; i18n infra in v2 |
| 8 | Mobile app? | SPA is responsive; native apps out of scope |

### 2.2 Backend Option Analysis

#### Option A — Node.js + Fastify (TypeScript)

| Criterion | Score |
|---|---|
| Language parity with frontend (TS everywhere) | ★★★ |
| Ecosystem for image processing (Sharp), S3 (aws-sdk), queues (BullMQ) | ★★★ |
| Performance (Fastify is the fastest mainstream Node framework) | ★★★ |
| Hiring / team familiarity (assumed) | ★★★ |
| Mature ORM options (Drizzle, Prisma, Kysely) | ★★★ |

#### Option B — Go + Chi / Echo

| Criterion | Score |
|---|---|
| Raw throughput and memory efficiency | ★★★ |
| Language parity with frontend | ★☆☆ |
| Image processing ecosystem | ★★☆ (cgo bindings to libvips, or shell-out) |
| Development velocity for a small team | ★★☆ |
| Type safety | ★★★ |

#### Option C — Python + FastAPI

| Criterion | Score |
|---|---|
| Rapid prototyping, huge ecosystem | ★★★ |
| Performance under I/O-heavy workloads | ★★☆ (async helps, but GIL limits CPU) |
| Image processing (Pillow, libvips bindings) | ★★★ |
| Type safety | ★★☆ (optional typing) |
| Language parity with frontend | ★☆☆ |

#### Decision: **Node.js + Fastify + TypeScript**

Rationale:
- Single language across entire stack — lower context-switching, shared validation schemas (Zod), shared types.
- Sharp (libvips wrapper) is the fastest image processing option in the Node ecosystem; performance comes from libvips itself, so any runtime calling libvips would be comparable.
- BullMQ provides production-grade job queues on top of the same Redis used for caching.
- Fastify's schema-based validation compiles to fast JIT checks; plugin architecture is clean.
- Drizzle ORM gives type-safe SQL without the magic of Prisma; migrations are plain SQL.

Go would be the pick if raw compute per dollar mattered more than velocity. Python would be the pick if the team were primarily data/ML engineers. Neither applies here.

---

## 3. Architecture Overview

### 3.1 Component Diagram

```
┌─────────────┐
│  React SPA  │
│  (Vite)     │
└──────┬──────┘
       │ HTTPS
       ▼ 
┌──────────────┐   ┌──────────┐   ┌─────┴──────┐
│   API GW /   │──▶│  Fastify │──▶│ S3-compat  │
│  Nginx / LB  │   │  API     │   │ (Garage/S3)│
└──────────────┘   └────┬─────┘   └────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
   ┌────────────┐ ┌──────────┐ ┌───────────┐
   │ PostgreSQL │ │  Redis   │ │  BullMQ   │
   │            │ │ (cache,  │ │  Workers  │
   │ users,     │ │ sessions,│ │ (thumb    │
   │ photos,    │ │ rate     │ │  gen,     │
   │ likes,     │ │ limits,  │ │  cleanup) │
   │ comments,  │ │ feed     │ │           │
   │ feed_scores│ │ cache)   │ │           │
   └────────────┘ └──────────┘ └───────────┘
```

### 3.2 Key User Flows

**Login:**
1. SPA → `POST /api/auth/login` (email + password)
2. API validates credentials (bcrypt compare)
3. Returns JWT access token (15 min) in body + sets `refreshToken` HTTP-only cookie (7 days)
4. SPA stores access token in memory (not localStorage)

**Upload:**
1. SPA → `POST /api/photos/upload` (multipart/form-data, auth required)
2. API validates file (type, size, magic bytes), generates UUID, stores original to S3 at `originals/{userId}/{uuid}.{ext}`
3. API inserts `photos` row (status = `processing`)
4. API enqueues `generate-thumbnails` job → returns `201` with photo ID
5. BullMQ worker picks up job → Sharp generates 3 sizes → uploads to S3 → updates `photos.status = 'ready'` + writes thumbnail URLs
6. SPA polls or receives SSE/WebSocket event for status change

**Like:**
1. SPA → `POST /api/photos/{id}/like` (auth required)
2. API inserts into `likes` (unique constraint on `userId + photoId`)
3. API increments `photos.like_count` (denormalized counter)
4. API enqueues lightweight `recalc-feed-score` job (or does it inline — see §7)

**Comment:**
1. SPA → `POST /api/photos/{id}/comments` (auth required)
2. API sanitizes text (DOMPurify-equivalent server-side), inserts `comments` row
3. Returns created comment

**Browse Feed:**
1. SPA → `GET /api/feed?cursor=...&limit=20` (public, no auth required)
2. API reads from `feed_scores` (materialized ranking) with cursor pagination
3. Redis caches the top N pages (invalidated on score recalc)
4. Returns photo list with author info, like counts, comment counts

**Search Users:**
1. SPA → `GET /api/users/search?q=...&limit=20`
2. API queries Postgres using `pg_trgm` similarity on normalized name/username/city
3. Returns ranked user list

---

## 4. Data Model

### 4.1 Core Entities (PostgreSQL)

```sql
-- Users
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    username      TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    city          TEXT,
    password_hash TEXT NOT NULL,
    avatar_url    TEXT,
    bio           TEXT,
    role          TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Normalized search columns (auto-populated via trigger or app layer)
ALTER TABLE users ADD COLUMN search_name   TEXT GENERATED ALWAYS AS (
    unaccent(lower(display_name))
) STORED;
ALTER TABLE users ADD COLUMN search_user   TEXT GENERATED ALWAYS AS (
    unaccent(lower(username))
) STORED;
ALTER TABLE users ADD COLUMN search_city   TEXT GENERATED ALWAYS AS (
    unaccent(lower(coalesce(city, '')))
) STORED;

CREATE INDEX idx_users_search_name ON users USING gin (search_name gin_trgm_ops);
CREATE INDEX idx_users_search_user ON users USING gin (search_user gin_trgm_ops);
CREATE INDEX idx_users_search_city ON users USING gin (search_city gin_trgm_ops);

-- Photos
CREATE TABLE photos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    caption         TEXT,
    status          TEXT NOT NULL DEFAULT 'processing',
        -- 'processing' | 'ready' | 'failed' | 'deleted'
    original_key    TEXT NOT NULL,   -- S3 key
    thumb_small_key TEXT,            -- 256px wide
    thumb_medium_key TEXT,           -- 800px wide
    thumb_large_key TEXT,            -- 1600px wide
    width           INT,
    height          INT,
    size_bytes       BIGINT,
    mime_type       TEXT,
    like_count      INT NOT NULL DEFAULT 0,
    comment_count   INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_photos_user     ON photos(user_id);
CREATE INDEX idx_photos_created  ON photos(created_at DESC);
CREATE INDEX idx_photos_status   ON photos(status) WHERE status = 'ready';

-- Likes
CREATE TABLE likes (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    photo_id   UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, photo_id)
);

CREATE INDEX idx_likes_photo ON likes(photo_id);

-- Comments
CREATE TABLE comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id   UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_photo ON comments(photo_id, created_at);

-- Feed Scores (read model for ranked feed)
CREATE TABLE feed_scores (
    photo_id   UUID PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
    score      DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feed_scores_rank ON feed_scores(score DESC);
```

### 4.2 Storage Choices — Why What Lives Where

| Store | What | Why |
|---|---|---|
| **PostgreSQL** | Users, photos metadata, likes, comments, feed_scores | Relational integrity, ACID transactions, strong indexing. Likes need unique constraints. Feed scores need ordered index. Comments are relational. |
| **Redis** | Session/refresh tokens, rate-limit counters, feed page cache, BullMQ job queue | Sub-ms reads for hot data. Rate limiting needs atomic increments with TTL. Feed cache is short-lived (30–60s TTL). BullMQ requires Redis. |
| **S3-compatible** | Original photos, generated thumbnails | Cheap, durable object storage. Never store binary blobs in Postgres. |
| **Elasticsearch** (v2) | User search, photo search by caption | When pg_trgm stops scaling (>100k users with complex queries), ES provides better relevance tuning, multi-field search, and fuzzy matching. Not needed in MVP. |

**Mongo — why not:** Every entity here has clear relational structure (user→photos, photo→likes, photo→comments). Mongo's schemaless flexibility is a liability, not an asset, for this domain. Postgres with JSONB covers any semi-structured needs (e.g., EXIF metadata on photos).

---

## 5. API Design

### 5.1 REST vs GraphQL

**Decision: REST (JSON:API-inspired conventions)**

Rationale:
- The data graph is shallow (no deep nesting beyond photo→comments, user→photos).
- REST is simpler to cache (Redis), rate-limit, and debug.
- GraphQL adds complexity (schema stitching, N+1 prevention, upload handling) with little benefit here.
- TanStack Query on the frontend pairs naturally with REST endpoints.

If deep nested queries become necessary (e.g., "user's photos with their comments and like counts in one call"), we can add specific composite endpoints rather than adopting full GraphQL.

### 5.2 Auth: JWT + Refresh Cookie

| Token | Storage | Lifetime | Purpose |
|---|---|---|---|
| Access token | In-memory (JS variable) | 15 min | Authorizes API requests via `Authorization: Bearer` header |
| Refresh token | HTTP-only, Secure, SameSite=Strict cookie | 7 days | Silently refreshes expired access tokens via `POST /api/auth/refresh` |

Why not sessions: JWTs are stateless, which simplifies horizontal scaling. The short access token lifetime limits damage from token theft. Refresh tokens are stored in Redis for revocation capability (logout, password change).

### 5.3 Endpoint Map

```
Auth
  POST   /api/auth/register          Register new user
  POST   /api/auth/login             Login, returns tokens
  POST   /api/auth/refresh           Refresh access token
  POST   /api/auth/logout            Invalidate refresh token

Users
  GET    /api/users/me               Current user profile
  PATCH  /api/users/me               Update profile
  GET    /api/users/:id              Public user profile
  GET    /api/users/search?q=        Search users

Photos
  POST   /api/photos                 Upload photo (multipart)
  GET    /api/photos/:id             Single photo detail
  PATCH  /api/photos/:id             Update caption
  DELETE /api/photos/:id             Soft-delete own photo
  GET    /api/users/:id/photos       User's photos (paginated)

Likes
  POST   /api/photos/:id/like        Like a photo
  DELETE /api/photos/:id/like        Unlike a photo

Comments
  GET    /api/photos/:id/comments    List comments (paginated)
  POST   /api/photos/:id/comments    Add comment
  DELETE /api/comments/:id           Delete own comment

Feed
  GET    /api/feed?cursor=&limit=    Public ranked feed
```

### 5.4 Pagination

Cursor-based pagination everywhere (not offset). The cursor is an opaque base64-encoded value containing `(score, id)` for the feed or `(created_at, id)` for chronological lists. This avoids the consistency issues of offset pagination when items are inserted/deleted.

Response shape:
```json
{
  "data": [...],
  "pagination": {
    "nextCursor": "eyJzIjozLjE0LCJpIjoiYWJjMTIzIn0=",
    "hasMore": true
  }
}
```

### 5.5 Error Convention

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}
```

HTTP status codes: 400 (validation), 401 (unauthenticated), 403 (forbidden), 404 (not found), 409 (conflict, e.g., duplicate like), 413 (file too large), 429 (rate limit), 500 (server error).

### 5.6 Rate Limiting

| Endpoint group | Limit | Window |
|---|---|---|
| Auth (login/register) | 10 req | 15 min per IP |
| Upload | 30 photos | 1 hour per user |
| Like/comment | 120 req | 1 min per user |
| Feed/read | 300 req | 1 min per IP |
| Search | 60 req | 1 min per IP |

Implemented via Redis sliding window counters (`@fastify/rate-limit` plugin).

---

## 6. Thumbnail / Preview Generation Pipeline

### 6.1 Sizes and Naming

| Size | Max width | Use case | S3 key pattern |
|---|---|---|---|
| Original | as-is | Download, zoom | `originals/{userId}/{photoId}.{ext}` |
| Large | 1600px | Full-screen view | `thumbs/{photoId}/large.webp` |
| Medium | 800px | Feed cards | `thumbs/{photoId}/medium.webp` |
| Small | 256px | Grid/avatar | `thumbs/{photoId}/small.webp` |

All thumbnails are converted to WebP for consistent compression. Aspect ratio is preserved (width-constrained resize).

### 6.2 Pipeline

```
Upload API
    │
    ▼
S3: store original ──▶ DB: insert photo (status='processing')
    │
    ▼
BullMQ: enqueue 'generate-thumbnails' job
    payload: { photoId, originalKey, userId }
    │
    ▼
Worker picks up job
    │
    ├── Download original from S3
    ├── Validate image (Sharp metadata: is it a real image?)
    ├── Strip EXIF GPS data (privacy)
    ├── Generate 3 sizes in parallel (Sharp pipeline)
    ├── Upload 3 thumbnails to S3
    ├── UPDATE photos SET status='ready', thumb keys, dimensions
    └── Done
```

### 6.3 Reliability

| Concern | Solution |
|---|---|
| **Retries** | BullMQ built-in: 3 attempts, exponential backoff (1s, 4s, 16s) |
| **Idempotency** | Job ID = `thumb-{photoId}`. Re-running overwrites the same S3 keys and DB row; no duplicates. |
| **Poison messages** | After 3 failures, job moves to "failed" queue. Photo status set to `'failed'`. Admin dashboard shows failed jobs. |
| **Worker crash** | BullMQ uses Redis locks with TTL. If worker dies mid-job, lock expires and another worker picks it up. |
| **Duplicate enqueue** | BullMQ deduplicates by job ID. If upload endpoint retries (network glitch), same job ID = no-op. |
| **Large file OOM** | Sharp streams; set max memory for the worker process; reject files > 20MB at upload time. |
| **Hostile input** | Set `Sharp.limitInputPixels` (default ~268 MP, lower to ~100 MP). Set a per-job timeout in BullMQ (`timeout: 60_000`). Validate image dimensions via Sharp metadata before full decode. |
| **Concurrency** | Each worker process handles N concurrent jobs (default: 3). Scale workers horizontally. |

### 6.4 Cleanup

A separate scheduled BullMQ job (cron: every hour) finds photos with `status='processing'` older than 30 minutes and re-enqueues them, or marks them `'failed'` if already retried 3x.

---

## 7. Feed Ranking Formula

### 7.1 Requirements

- New photos should appear on the feed quickly.
- Popular photos should rank higher, but not dominate forever.
- Old photos must decay regardless of like count ("no eternal winners").
- Resist simple gaming (like-bombing).

### 7.2 Formula: Gravity-Based Decay (Hacker News Style, Modified)

```
score = like_count / (hours_since_upload + 2) ^ gravity
```

Where:
- `like_count` = total likes on the photo
- `hours_since_upload` = (now - photo.created_at) in fractional hours
- `gravity` = 1.5 (tunable; higher = faster decay)
- The `+ 2` prevents division-by-zero and gives new photos a 2-hour "boost window"

### 7.3 Properties

| Property | How It's Achieved |
|---|---|
| Fresh photos surface quickly | At t=0, denominator = 2^1.5 ≈ 2.83, so even 1 like gives a non-trivial score |
| Popular photos rank higher | Numerator is proportional to likes |
| No eternal winners | Denominator grows polynomially with time — a photo with 1000 likes uploaded 7 days ago scores lower than a photo with 10 likes uploaded 1 hour ago |
| Anti-gaming | Like velocity doesn't help — score is total likes / time^gravity, so even a burst of fake likes gets crushed by time decay in hours. Combined with rate limiting on likes (§5.6) and future anti-spam (v1). |

### 7.4 Worked Example

Five photos, scored at the current moment:

| Photo | Likes | Uploaded | hours_since | Score = likes / (hours + 2)^1.5 |
|---|---|---|---|---|
| A | 50 | 1 hour ago | 1 | 50 / 3^1.5 = 50 / 5.20 = **9.62** |
| B | 200 | 12 hours ago | 12 | 200 / 14^1.5 = 200 / 52.38 = **3.82** |
| C | 5 | 10 min ago | 0.17 | 5 / 2.17^1.5 = 5 / 3.20 = **1.56** |
| D | 1000 | 3 days ago | 72 | 1000 / 74^1.5 = 1000 / 636.9 = **1.57** |
| E | 3000 | 14 days ago | 336 | 3000 / 338^1.5 = 3000 / 6214 = **0.48** |

**Ranked feed order:** A (9.62) → B (3.82) → D (1.57) → C (1.56) → E (0.48)

Observation: Photo D has 1000 likes but 3 days old — it ranks similarly to Photo C with just 5 likes but uploaded 10 minutes ago. Photo E with 3000 likes is effectively gone from the top after 2 weeks. This is the desired "no eternal winners" behavior.

### 7.5 Computation Strategy

**MVP (online recalc):**
- On like/unlike, recalculate the score for that single photo and `UPSERT` into `feed_scores`.
- A scheduled BullMQ cron job runs every 5 minutes and recalculates ALL scores (time decay means scores change even without new likes). This is cheap: one `UPDATE feed_scores SET score = ... FROM photos` query.
- Redis caches the first 5 pages of the feed (key: `feed:page:{n}`, TTL: 30 seconds). Cache is invalidated on score recalc.

**v1 (optimization):**
- Only recalculate scores for photos < 7 days old (older photos have negligible scores).
- Feed API reads from `feed_scores` with an index scan — fast even at 100k photos.

**v2 (event-driven):**
- Like events publish to a lightweight event bus (Redis Pub/Sub or BullMQ).
- A feed-updater worker subscribes, recalculates affected scores, updates Redis cache.
- Consider a separate read replica for feed queries.

### 7.6 Future Anti-Gaming Enhancements (v1–v2)

- Detect like velocity anomalies (>10 likes from new accounts in 1 minute → flag for review).
- Weight likes by account age (accounts < 24h old count as 0.1 likes).
- IP-based deduplication of likes from same origin.
- Shadowban: flagged photos appear in feed only for the uploader.

---

## 8. User Search

### 8.1 Option A — PostgreSQL `pg_trgm` + `unaccent`

**How it works:**
- `pg_trgm` extension splits strings into 3-character grams and indexes them via GIN.
- `unaccent` extension removes diacritics (é→e, ü→u).
- Combined: case-insensitive, diacritics-insensitive, partial-match search.

**Query example:**
```sql
SELECT id, username, display_name, city,
       greatest(
           similarity(search_name, unaccent(lower($1))),
           similarity(search_user, unaccent(lower($1))),
           similarity(search_city, unaccent(lower($1)))
       ) AS relevance
FROM users
WHERE search_name % unaccent(lower($1))
   OR search_user % unaccent(lower($1))
   OR search_city % unaccent(lower($1))
ORDER BY relevance DESC
LIMIT 20;
```

(`%` is the similarity operator; default threshold 0.3, tunable via `set_limit()`.)

**Pros:**
- Zero additional infrastructure — lives in the same Postgres.
- Handles partial matches, typos, diacritics out of the box.
- GIN indexes make it fast for up to ~500k users.
- Transactionally consistent — new user immediately searchable.

**Cons:**
- No built-in transliteration (Кирилл → Kirill) — requires custom `unaccent.rules` or app-layer transliteration column.
- Relevance tuning is limited compared to Elasticsearch.
- Performance degrades with very large datasets or complex multi-field ranking.
- No "did you mean?" / fuzzy suggestions.

**Transliteration workaround:**
Add a `search_name_latin` generated column that applies a transliteration function (implemented as a PL/pgSQL function or computed in the application layer before insert/update), and include it in the search query.

### 8.2 Option B — Elasticsearch / OpenSearch

**How it works:**
- Dedicated search index with `users` mapping.
- Multi-field search with analyzers: `lowercase`, `asciifolding` (diacritics), `icu_transliteration` (Cyrillic→Latin), `edge_ngram` (prefix/partial match).
- Query uses `multi_match` with `cross_fields` or `bool` with field boosts.

**Pros:**
- Superior relevance tuning (field boosts, function_score, decay).
- Native transliteration via ICU analysis.
- "Did you mean?" / autocomplete via `completion` suggester.
- Scales horizontally to millions of users.
- Fast even with complex queries.

**Cons:**
- Significant operational overhead (cluster management, JVM tuning, index management).
- Data synchronization lag (eventual consistency with Postgres).
- Additional infrastructure cost.
- Overkill for < 50k users.

### 8.3 Option C — Postgres Full-Text Search (tsvector)

Not ideal here. FTS is designed for document/text search, not short-string matching on names and cities. It tokenizes by words and matches whole tokens — useless for partial name matches like "Ale" → "Alexey". `pg_trgm` is strictly better for this use case.

### 8.4 Decision

**MVP + v1: Postgres `pg_trgm` + `unaccent`** (Option A)

- Sufficient for up to ~200–500k users.
- No operational overhead.
- Add app-layer transliteration for Cyrillic/non-Latin names (store a `search_name_latin` column).

**v2: Migrate to Elasticsearch** (Option B) when either:
- User count exceeds 500k, or
- Product requires autocomplete / "did you mean?" / complex relevance tuning.

Migration path: dual-write to both Postgres and ES during transition; switch search queries to ES; eventually remove `pg_trgm` indexes.

---

## 9. Security

### 9.1 File Upload Safety

| Check | Implementation |
|---|---|
| File size | Fastify `bodyLimit` on upload route (20 MB) |
| MIME type | Check `Content-Type` header AND magic bytes (via `file-type` npm package) — must match allowed list |
| File extension | Allowlist: `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic` |
| Image validity | Sharp attempts to read metadata; rejects corrupt/non-image files |
| EXIF stripping | Sharp strips all EXIF (especially GPS) during thumbnail generation |
| Filename | Ignored; server generates UUID-based S3 key |
| S3 ACL | Bucket allows direct app access. Public read for authenticated requests via app proxy. |

### 9.2 Comment / Text Sanitization

- All user-provided text (comments, captions, bio, display_name) is sanitized server-side.
- Use `sanitize-html` with a strict allowlist (no HTML tags in comments; strip everything).
- Store sanitized text in DB. Never trust client-side sanitization alone.
- React's JSX auto-escapes by default — but sanitize on write as defense-in-depth.

### 9.3 Authentication Security

- Passwords hashed with bcrypt (cost factor 12).
- Access tokens are short-lived (15 min) to limit exposure.
- Refresh tokens stored in Redis with user-specific key; revoked on logout and password change.
- `Secure`, `HttpOnly`, `SameSite=Strict` on refresh cookie.
- CSRF protection: since access token is in `Authorization` header (not cookie), CSRF is mitigated for all authenticated endpoints.

### 9.4 Rate Limiting & Abuse Prevention

- Per-IP and per-user rate limits (see §5.6).
- Slow-down on repeated failed logins (exponential delay after 5 failures per account).
- Upload rate limit prevents storage abuse.
- Comment length limit (2000 chars).
- Basic spam detection in v1: flag comments with excessive URLs or repeated identical text.

### 9.5 Privacy Basics

- User email is never exposed in public API responses.
- EXIF/GPS data stripped from all thumbnails.
- Users can delete their own photos (soft delete; originals purged after 30 days).
- Account deletion endpoint (v1): anonymizes personal data, deletes photos.

---

## 10. Scalability

### 10.1 Likely Bottlenecks & Solutions

| Bottleneck | When | Solution |
|---|---|---|
| **Image processing** | >100 uploads/min | Scale BullMQ workers horizontally (separate containers/pods). Workers are stateless. |
| **Feed query** | >1000 req/s | Redis cache (30s TTL) for top pages. `feed_scores` index is B-tree on `score DESC` — fast. Add read replica if needed. |
| **S3 reads (images)** | As usage grows | App serves images directly from S3. Redis cache layer for metadata. Defer CDN to v2 when bandwidth costs grow. |
| **Database writes** | >10k likes/min | Connection pooling (PgBouncer). Like count update uses `UPDATE ... SET like_count = like_count + 1` (atomic, no read-modify-write). Partitioning `likes` table by month if needed. |
| **User search** | >500k users | Migrate to Elasticsearch (see §8.4). |
| **Database size** | >10M photos | Partition `photos` by `created_at` (range). Archive old `feed_scores` entries (photos > 30 days have ~zero score). |

### 10.2 Horizontal Scaling Strategy

```
          Load Balancer
         ┌─────┴──────┐
    API Pod 1     API Pod 2  ...  API Pod N
         │             │
    ┌────┴─────────────┴────┐
    │      PgBouncer        │
    │  ┌─────────────────┐  │
    │  │  Postgres Primary│  │
    │  │   ↓ replication  │  │
    │  │  Postgres Replica│  │ (read replica for feed queries)
    │  └─────────────────┘  │
    └───────────────────────┘

    Worker Pod 1  Worker Pod 2  ...  Worker Pod M
         │             │
         └──── Redis ──┘ (shared BullMQ + cache)
```

All API pods and workers are stateless. Scale by adding pods. Redis is the only shared mutable state beyond Postgres.

---

## 11. Observability

### 11.1 Logging

- Structured JSON logs via `pino` (Fastify's default logger).
- Log levels: `error`, `warn`, `info`, `debug`.
- Every request logged with: `requestId`, `method`, `path`, `statusCode`, `responseTime`, `userId` (if authenticated).
- BullMQ worker logs: `jobId`, `jobName`, `duration`, `status`.
- Ship logs to a centralized system (ELK, Loki, or CloudWatch).

### 11.2 Metrics

Expose Prometheus metrics via `fastify-metrics`:
- `http_request_duration_seconds` (histogram, by route and status)
- `http_requests_total` (counter, by route and status)
- `bullmq_job_duration_seconds` (histogram, by job name)
- `bullmq_jobs_waiting` (gauge)
- `bullmq_jobs_failed_total` (counter)
- `db_query_duration_seconds` (histogram)
- `feed_cache_hit_ratio` (gauge)

### 11.3 Tracing

- OpenTelemetry SDK for distributed tracing.
- Trace spans: HTTP request → DB query → Redis get → S3 upload.
- Export to Jaeger or Grafana Tempo.
- MVP: just request-ID-based correlation in logs. Full tracing in v1.

### 11.4 Alerting

| Alert | Condition | Severity |
|---|---|---|
| API error rate | >5% 5xx in 5 min | Critical |
| API latency | p95 > 500ms for 5 min | Warning |
| Feed latency | p95 > 300ms for 5 min | Warning |
| Worker queue depth | >1000 pending jobs for 10 min | Warning |
| Worker failure rate | >10% failed jobs in 1 hour | Critical |
| Disk/S3 errors | Any S3 write failure | Critical |
| DB connection pool | >80% utilization for 5 min | Warning |

---

## 12. Testing Strategy

### 12.1 Test Pyramid

```
         ╱  E2E  ╲         5–10 critical user journeys
        ╱─────────╲
       ╱ Integration╲      API route tests with real DB (testcontainers)
      ╱───────────────╲
     ╱    Unit Tests    ╲   Business logic, validators, ranking formula
    ╱─────────────────────╲
```

### 12.2 Specifics

| Layer | Tool | What | Coverage Target |
|---|---|---|---|
| **Unit** | Vitest | Ranking formula, validators, sanitizers, helpers, Zod schemas | High (>80%) |
| **Integration** | Vitest + Testcontainers (Postgres, Redis, Garage v2) | API routes end-to-end (HTTP → DB → response). Auth flows, upload flow, feed pagination. | All endpoints |
| **E2E** | Playwright | Login → upload → see photo in feed → like → comment → search user | Critical paths |
| **API contract** | Zod schemas (shared) + OpenAPI spec (generated) | Request/response shapes match between frontend and backend | Auto-enforced |
| **Frontend unit** | Vitest + React Testing Library | Component rendering, hooks, state logic | Key components |
| **Load** | k6 | Feed endpoint < 300ms p95 at 500 concurrent users | v1 |

### 12.3 Test Data

- Seed script generates 100 users, 1000 photos, random likes/comments for local dev and CI.
- Integration tests use Testcontainers — each test suite gets a fresh Postgres + Redis.
- Fixtures for images: 5 sample images of varying sizes (100KB–15MB) committed to `test/fixtures/`.

---

## 13. DevOps & Environments

### 13.1 Environments

| Environment | Purpose | Infra |
|---|---|---|
| **Local dev** | Developer machines | Docker Compose: Postgres, Redis, Garage v2 (S3-compatible). API + SPA run natively (hot reload). |
| **CI** | Automated tests | GitHub Actions. Testcontainers for Postgres/Redis/Garage v2. Linting, type-check, unit, integration, E2E. |
| **Staging** | Pre-prod validation | Mirrors prod infra (smaller instances). Deployed on every merge to `main`. |
| **Production** | Live users | Cloud-hosted (AWS/GCP/Hetzner). Auto-scaling API pods, managed Postgres, managed Redis. |

### 13.2 Docker

```
/docker
  docker-compose.yml          # Local dev: Postgres, Redis, Garage v2
  docker-compose.ci.yml       # CI overrides
  Dockerfile.api              # Multi-stage: build → slim runtime
  Dockerfile.worker           # Same build, different entrypoint
```

API and Worker share the same codebase but have different Dockerfile entrypoints:
- API: `node dist/server.js`
- Worker: `node dist/worker.js`

### 13.3 CI/CD Pipeline (GitHub Actions)

```
on push to any branch:
  ├── Lint (Biome)
  ├── Type check (tsc --noEmit) — both client and server
  ├── Unit tests (Vitest)
  ├── Integration tests (Vitest + Testcontainers)
  └── Build Docker images (verify they build)

on push to main:
  ├── All above
  ├── E2E tests (Playwright against Docker Compose stack)
  ├── Build + push Docker images to registry
  └── Deploy to staging (auto)

on manual trigger / tag:
  └── Promote staging image to production
```

### 13.4 API Contract Versioning

- In MVP/v1 the SPA and API are deployed together in the same CI pipeline run — the SPA build is triggered only after the API image is built and tests pass. This eliminates frontend/backend version skew.
- Shared Zod schemas in the `shared/` package provide compile-time contract enforcement. Runtime validation at API boundaries (request parsing) catches any remaining mismatches.
- If SPA and API deployments are ever decoupled (e.g., CDN-cached SPA vs. rolling API deploy), introduce an `API-Version` header or versioned URL prefix (`/api/v1/`) before splitting.

### 13.5 Database Migrations

- Drizzle Kit for migration generation (SQL files).
- Migrations run automatically on API startup (with advisory lock to prevent concurrent runs).
- Migrations are forward-only; no down migrations in prod (use corrective forward migrations instead).
- Migration files committed to `server/drizzle/` directory.

### 13.6 Secrets Management

- Local dev: `.env` files (gitignored).
- CI: GitHub Actions secrets.
- Prod: cloud-native secrets (AWS Secrets Manager / GCP Secret Manager) injected as env vars.
- Never commit secrets. `.env.example` with dummy values for documentation.

---

## 14. Phase-Based Roadmap

### Phase MVP — "It Works"

**Goal:** A functional photo gallery with upload, feed, likes, comments, and user search. Deployed to staging.

**Duration estimate:** Not provided (per guidelines). Effort is estimated by epic size.

#### Epic M1: Project Scaffolding & Infra

| Task | DoD |
|---|---|
| M1.1 Initialize monorepo structure (`client/`, `server/`, `docker/`, `docs/`) | Directories exist, READMEs describe purpose |
| M1.2 Set up Fastify server with TypeScript, Pino logger, health endpoint | `GET /api/health` returns 200 |
| M1.3 Docker Compose for Postgres, Redis, Garage v2 | `docker compose up` starts all services; API can connect. Redis configured with `appendonly yes` for durability (BullMQ depends on it as production infrastructure, not just cache). |
| M1.4 Drizzle ORM setup + initial migration (users, photos, likes, comments, feed_scores) | Migration runs; tables created; Drizzle client connects |
| M1.5 S3 client module (upload, download, delete, presign) | Unit tests pass against Garage v2 |
| M1.6 Configure Biome, Vitest for server | `npm run lint` and `npm test` pass |
| M1.7 GitHub Actions CI: lint + type-check + unit tests | Green CI on push |

#### Epic M2: Authentication

| Task | DoD |
|---|---|
| M2.1 `POST /api/auth/register` — validate input (Zod), hash password, insert user, return tokens | Integration test: register → get tokens → access protected route |
| M2.2 `POST /api/auth/login` — verify credentials, return tokens | Integration test: login with correct/incorrect credentials |
| M2.3 `POST /api/auth/refresh` — validate refresh token, return new access token | Integration test: expired access token → refresh → new token works |
| M2.4 `POST /api/auth/logout` — revoke refresh token in Redis | Integration test: logout → refresh fails |
| M2.5 Auth middleware (Fastify preHandler) — verify JWT, attach user to request | Protected routes return 401 without token |
| M2.6 Rate limiting on auth endpoints | Integration test: >10 requests → 429 |

#### Epic M3: Photo Upload & Thumbnail Pipeline

| Task | DoD |
|---|---|
| M3.1 `POST /api/photos` — multipart upload, validate file, store original to S3, insert DB row | Integration test: upload valid file → DB row + S3 object exist |
| M3.2 File validation (size, MIME, magic bytes) | Rejects invalid files (wrong type, too large, corrupt) |
| M3.3 BullMQ setup + `generate-thumbnails` worker | Worker processes job; 3 thumbnails in S3; photo status updated to 'ready' |
| M3.4 Retry logic, failure handling, idempotency | Failed job retries 3x; photo marked 'failed' after exhaustion |
| M3.5 `GET /api/photos/:id` — return photo metadata with thumbnail URLs | Returns S3-direct URLs; 404 for missing |
| M3.6 `DELETE /api/photos/:id` — soft delete (owner only) | Photo status = 'deleted'; excluded from feed and user profile |
| M3.7 `PATCH /api/photos/:id` — update caption (owner only) | Caption updated; sanitized |

#### Epic M4: Likes & Comments

| Task | DoD |
|---|---|
| M4.1 `POST /api/photos/:id/like` — insert like, increment counter | Like created; counter incremented; duplicate returns 409 |
| M4.2 `DELETE /api/photos/:id/like` — remove like, decrement counter | Like removed; counter decremented; no-op if not liked |
| M4.3 `POST /api/photos/:id/comments` — sanitize, insert | Comment created; body sanitized (no HTML) |
| M4.4 `GET /api/photos/:id/comments?cursor=` — paginated | Returns comments newest-first with cursor pagination |
| M4.5 `DELETE /api/comments/:id` — delete own comment | Owner can delete; non-owner gets 403 |

#### Epic M5: Feed

| Task | DoD |
|---|---|
| M5.1 Implement ranking formula (§7) as a pure function | Unit tests with known inputs/outputs match worked example |
| M5.2 Score recalculation job (BullMQ cron, every 5 min) | `feed_scores` table updated; scores match formula |
| M5.3 `GET /api/feed?cursor=&limit=` — read from `feed_scores`, join photos + users | Returns ranked photos; cursor pagination works; p95 < 300ms on seed data |
| M5.4 Redis cache for top feed pages (30s TTL) | Cache hit ratio >80% under repeated requests |
| M5.5 Inline score recalc on like/unlike | Score updates within 1 second of like event |

#### Epic M6: User Search

| Task | DoD |
|---|---|
| M6.1 Enable `pg_trgm` + `unaccent` extensions, add generated columns + GIN indexes | Migration runs successfully |
| M6.2 `GET /api/users/search?q=` — trigram similarity search across name, username, city | Returns relevant results for partial matches, case-insensitive, diacritics-insensitive |
| M6.3 Add transliteration column (app-layer: Cyrillic→Latin via `transliteration` npm) | Searching "Aleksey" finds "Алексей" |
| M6.4 Result relevance ordering | Most similar match first; ties broken by username alphabetically |

#### Epic M7: User Profiles

| Task | DoD |
|---|---|
| M7.1 `GET /api/users/me` + `PATCH /api/users/me` | Auth user can view/update own profile |
| M7.2 `GET /api/users/:id` — public profile | Returns display_name, username, city, avatar, bio, photo count |
| M7.3 `GET /api/users/:id/photos?cursor=` — user's photos | Paginated, newest-first; only 'ready' photos |

#### Epic M8: Frontend MVP

| Task | DoD |
|---|---|
| M8.1 Set up React Router, TanStack Query, Zustand, Tailwind CSS | `npm run dev` renders shell with routing |
| M8.2 Auth pages: Register, Login | Can register and log in; tokens managed; redirects work |
| M8.3 Layout: Navbar (logo, search, upload button, user menu) | Responsive; shows login/register for guests, user menu for authenticated |
| M8.4 Feed page (home): Masonry/grid of photos, infinite scroll | Loads feed, scrolls to load more, shows like count |
| M8.5 Photo detail modal/page: full image, likes, comments | Like button works (toggle); comments list with input |
| M8.6 Upload page: drag-and-drop / file picker, caption input, progress | Upload with preview; shows processing state; redirects to photo on ready |
| M8.7 User profile page: avatar, info, photo grid | Navigable from feed/comments |
| M8.8 Search page/modal: search input, user result list | Searches as user types (debounced); links to profiles |
| M8.9 Error handling: toast notifications, error boundaries | API errors show user-friendly messages |

#### Epic M9: MVP Integration & Deployment

| Task | DoD |
|---|---|
| M9.1 Integration tests for all API endpoints | All pass in CI with Testcontainers |
| M9.2 Playwright E2E: register → upload → feed → like → comment → search | Test passes in CI |
| M9.3 Docker images for API + Worker | Build and run locally |
| M9.4 Deploy to staging environment | Staging accessible; all features work manually |
| M9.5 Seed script (100 users, 1000 photos, random interactions) | Run on staging; feed is populated |

**MVP Definition of Done:**
- All epics M1–M9 complete.
- CI is green (lint + types + unit + integration + E2E).
- Staging deployment works.
- A non-team-member can register, upload a photo, see it in the feed, like/comment, and search for a user.

**MVP Risks:**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sharp/libvips build issues in Docker | Medium | Blocks thumbnail pipeline | Use official `node:20-slim` + `apt install libvips-dev`; pin versions |
| BullMQ reliability in dev | Low | Jobs lost | Redis persistence (AOF); integration tests cover job flow |
| Feed performance with naive ranking | Low | Slow feed | `feed_scores` table with B-tree index; verified via load test on seed data |
| Scope creep | High | Delays MVP | Strict MVP scope; defer all v1/v2 features |

---

### Phase v1 — "It's Good"

**Goal:** Production-ready. Polished UX, admin basics, notifications, better security, performance validation.

**Prerequisites:** MVP complete and deployed to staging.

#### Epic V1.1: Production Hardening

| Task | DoD |
|---|---|
| V1.1.1 PgBouncer connection pooling | API uses pooled connections; no connection exhaustion under load |
| V1.1.2 Health checks (liveness + readiness) for API and Worker | `/api/health/live`, `/api/health/ready`; ready checks Postgres + Redis connectivity |
| V1.1.3 Graceful shutdown (drain connections, finish current jobs) | No dropped requests on deploy |
| V1.1.4 Request ID correlation in logs | Every log line has `requestId`; traceable across services |

#### Epic V1.2: Admin & Moderation

| Task | DoD |
|---|---|
| V1.2.1 Admin role + protected admin routes | Admin endpoints return 403 for non-admins |
| V1.2.2 Admin API: list/flag/delete photos, ban users, view failed jobs | All endpoints work; tested |
| V1.2.3 Basic admin UI (separate route in SPA or simple React page) | Admin can review flagged content, delete photos, ban users |
| V1.2.4 Photo reporting: `POST /api/photos/:id/report` | Users can report photos; reports visible in admin panel |
| V1.2.5 Basic spam detection: flag comments with >3 URLs, duplicate text across comments | Auto-flagged; admin notified |

#### Epic V1.3: Notifications (In-App)

| Task | DoD |
|---|---|
| V1.3.1 `notifications` table (userId, type, payload, read, created_at) | Migration runs |
| V1.3.2 Create notifications on like/comment events | Notification created for photo owner |
| V1.3.3 `GET /api/notifications?cursor=` | Paginated, newest-first |
| V1.3.4 `PATCH /api/notifications/:id/read` | Mark as read |
| V1.3.5 Frontend: notification bell with unread count, dropdown list | Badge shows count; dropdown shows notifications; click navigates to photo |

#### Epic V1.4: UX Polish

| Task | DoD |
|---|---|
| V1.4.1 Optimistic updates for like/unlike | Like button responds instantly; rollback on error |
| V1.4.2 Image lazy loading + blur placeholder (blurhash or LQIP) | Feed loads fast; images appear progressively |
| V1.4.3 Photo upload: client-side image preview + resize before upload | Faster uploads; reduced bandwidth |
| V1.4.4 Infinite scroll improvements (virtualization for long feeds) | Smooth scrolling with 1000+ photos |
| V1.4.5 Dark mode | Toggle in user menu; persists preference |
| V1.4.6 Accessibility audit (keyboard nav, ARIA labels, color contrast) | Passes axe-core automated checks |

#### Epic V1.5: Performance & Load Testing

| Task | DoD |
|---|---|
| V1.5.1 k6 load test scripts for feed, upload, like, search | Scripts committed; results documented |
| V1.5.2 Feed p95 < 300ms at 500 concurrent users | Load test passes |
| V1.5.3 Identify and fix any bottlenecks found | Document findings and fixes |
| V1.5.4 Database query analysis (EXPLAIN ANALYZE on critical queries) | No sequential scans on production queries |

#### Epic V1.6: Observability

| Task | DoD |
|---|---|
| V1.6.1 Prometheus metrics endpoint | Grafana dashboard shows request rate, latency, error rate |
| V1.6.2 Structured log shipping to centralized logging | Logs searchable by requestId, userId, error |
| V1.6.3 Alerting rules (see §11.4) | Alerts fire correctly on simulated failures |
| V1.6.4 OpenTelemetry basic tracing | Request traces visible in Jaeger/Tempo |

#### Epic V1.7: Security Hardening

| Task | DoD |
|---|---|
| V1.7.1 OWASP dependency scan in CI | `npm audit` + Snyk/Trivy in pipeline |
| V1.7.2 CSP headers on SPA | Content-Security-Policy set; no inline scripts |
| V1.7.3 Helmet middleware on API | Security headers (X-Frame-Options, etc.) set |
| V1.7.4 Account lockout after repeated failed logins | 5 failures → 15 min lockout; admin can unlock |
| V1.7.5 API input validation audit | All endpoints have Zod schemas; no unvalidated inputs |

**v1 Definition of Done:**
- All v1 epics complete.
- Production deployment (Docker-based, Garage S3, monitoring, alerting).
- Load test passes (feed p95 < 300ms, 500 concurrent).
- Admin can moderate content.
- No critical/high vulnerabilities in dependency scan.

**v1 Risks:**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Notification volume at scale | Low (v1 scale) | DB write pressure | Batch notification inserts; consider Redis-based unread count |
| Load test reveals unexpected bottleneck | Medium | Delays launch | Budget time for perf investigation; have a "good enough" fallback |

---

### Phase v2 — "It Scales"

**Goal:** Scale to hundreds of thousands of users. Advanced features, better search, event-driven architecture.

**Prerequisites:** v1 in production, stable under load.

#### Epic V2.1: Elasticsearch for Search

| Task | DoD |
|---|---|
| V2.1.1 Set up Elasticsearch cluster (managed or self-hosted) | Cluster running, accessible from API |
| V2.1.2 User index with analyzers (lowercase, asciifolding, ICU transliteration, edge_ngram) | Index created with mappings |
| V2.1.3 Dual-write: sync users to ES on create/update | New/updated users appear in ES within seconds |
| V2.1.4 Search API switches to ES query | Search results improved; autocomplete works |
| V2.1.5 Photo search by caption (new feature) | Users can search photos by caption text |
| V2.1.6 "Did you mean?" / fuzzy suggestions | Typo-tolerant search |

#### Epic V2.2: Event-Driven Architecture

| Task | DoD |
|---|---|
| V2.2.1 Event bus (Redis Streams or lightweight message broker) | Events published for like, comment, upload, user-update |
| V2.2.2 Feed score updater consumes like events | Feed updates within 5 seconds of like |
| V2.2.3 Notification service consumes events | Decoupled from API; notifications created asynchronously |
| V2.2.4 ES sync consumes user-update events | ES stays in sync without dual-write in API code |
| V2.2.5 Analytics event consumer (for future dashboards) | Events stored for analysis |

#### Epic V2.3: Advanced Feed

| Task | DoD |
|---|---|
| V2.3.1 Personalized feed (mix of global ranked + followed users) | User sees a blend; can toggle between "For You" and "Following" |
| V2.3.2 Follow/unfollow users | `follows` table; follow button on profiles |
| V2.3.3 Anti-gaming: like weighting by account age, velocity detection | Suspicious patterns flagged; weighted scoring in effect |
| V2.3.4 Feed diversity: avoid showing 5 photos from same user in a row | Deduplication logic in feed query |
| V2.3.5 Trending section (photos with fastest like velocity in last 6 hours) | Separate API endpoint; shown on homepage |

#### Epic V2.4: Scalability Improvements

| Task | DoD |
|---|---|
| V2.4.1 Postgres read replica for feed and search queries | Feed reads go to replica; write path unchanged |
| V2.4.2 Photo table partitioning by created_at (monthly) | Partition scheme active; queries use partition pruning |
| V2.4.3 Archive old feed_scores (>30 days) | Table size stays manageable |
| V2.4.4 Worker auto-scaling based on queue depth | Workers scale up when queue > 100 jobs |
| V2.4.5 CDN adoption (CloudFront/Cloudflare): image optimization (auto WebP/AVIF) | Reduced bandwidth; faster loads for global scale |

#### Epic V2.5: Advanced Features

| Task | DoD |
|---|---|
| V2.5.1 Threaded/nested comments | Reply-to-comment UI and API |
| V2.5.2 Push notifications (web push / FCM) | Users receive browser push for likes/comments |
| V2.5.3 Email notifications (digest: daily/weekly) | Email sent; user can configure frequency or opt out |
| V2.5.4 Photo albums/collections | Users can group photos into named albums |
| V2.5.5 Private photos (visible only to author or selected users) | Privacy toggle on upload; enforced in API |
| V2.5.6 i18n infrastructure | App supports English + 1 additional language |

#### Epic V2.6: ML & Advanced Moderation

| Task | DoD |
|---|---|
| V2.6.1 NSFW detection on upload (cloud API: AWS Rekognition / Google Vision) | Flagged photos held for review; not shown in feed |
| V2.6.2 Spam classifier for comments (simple model or API-based) | Auto-hide spam comments |
| V2.6.3 Auto-tagging photos (objects, colors, scene type) | Tags stored; searchable in ES |

**v2 Definition of Done:**
- All v2 epics complete.
- System handles 100k+ users with acceptable performance.
- Elasticsearch powers user and photo search.
- Event-driven architecture decouples core flows.
- Advanced moderation prevents most spam/abuse automatically.

**v2 Risks:**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Elasticsearch operational complexity | High | Downtime, data loss | Use managed ES (AWS OpenSearch); runbook for common issues; fallback to pg_trgm if ES is down |
| Event consistency (events lost or duplicated) | Medium | Stale search index, missing notifications | Transactional outbox pattern; idempotent consumers |
| ML API costs at scale | Medium | Budget overrun | Sample-based detection (check 1 in N uploads); cache results; set budget alerts |
| Personalized feed relevance | Medium | Poor user experience | A/B test; easy rollback to pure ranked feed |

---

## 15. Risks & Mitigations (Cross-Cutting)

### What to Postpone (Explicit Deferral List)

| Feature | Deferred To | Reason |
|---|---|---|
| Native mobile apps | Out of scope | SPA is responsive; native adds major complexity |
| GraphQL | Evaluate in v2 | REST is simpler and sufficient; re-evaluate if frontend needs demand it |
| Real-time feed updates (WebSocket) | v2 | SSE/polling is fine for MVP/v1; real-time adds infra complexity |
| ML-based content moderation | v2 | External API costs; rule-based is sufficient for early scale |
| Multi-region deployment | Post-v2 | Premature optimization; single region is fine for <1M users |
| Video support | Post-v2 | Fundamentally different pipeline (transcoding, streaming) |
| OAuth/social login (Google, GitHub) | v1 or v2 | Nice-to-have; email/password is sufficient for MVP |
| Elasticsearch | v2 | pg_trgm handles MVP/v1 scale |

### Cross-Cutting Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Single developer / small team** | High | Slow progress | Strict MVP scope; defer aggressively; use managed services |
| **S3 costs grow with storage** | Medium | Budget | Lifecycle policies (delete failed uploads, archive originals after N months); R2 is cheaper than S3 |
| **Redis as single point of failure** | Medium | Cache loss, queue loss | Redis persistence (RDB + AOF); managed Redis with replicas in prod; app degrades gracefully without cache |
| **Postgres schema evolution pain** | Low | Migration failures | Forward-only migrations; test migrations in CI against copy of prod schema; never run DDL without testing |
| **GDPR / privacy compliance** | Medium | Legal | Account deletion endpoint in v1; EXIF stripping from day 1; privacy policy page |

---

## Appendix A: Frontend Ecosystem Decisions

| Concern | Choice | Rationale |
|---|---|---|
| Routing | React Router v7 | De facto standard; file-based routing optional |
| Data fetching | TanStack Query v5 | Cache, deduplication, retry, optimistic updates, infinite scroll support |
| State management | Zustand | Lightweight, no boilerplate; only for client-only state (auth tokens, UI state). Server state lives in TanStack Query. |
| Forms | React Hook Form + Zod | Performant forms; Zod schemas shared with backend |
| Styling | Tailwind CSS v4 | Utility-first; fast to build; consistent design |
| Component library | shadcn/ui | Copy-paste components built on Radix; customizable; no runtime dependency lock-in |
| Image handling | Browser-native lazy loading + blurhash (v1) | Progressive loading; small bundle impact |
| Build | Vite 7 (already configured) | Fast HMR; good ecosystem |
| Testing | Vitest + React Testing Library + Playwright | Consistent with backend (Vitest); Playwright for E2E |

## Appendix B: Object Storage Path Convention

```
bucket: imagiverse-media

originals/{userId}/{photoId}.{ext}       # Original upload
thumbs/{photoId}/small.webp              # 256px wide
thumbs/{photoId}/medium.webp             # 800px wide
thumbs/{photoId}/large.webp              # 1600px wide
avatars/{userId}/avatar.webp             # User avatar (256x256, square crop)
```

Photo IDs are UUIDs — no enumeration possible. User IDs in the original path enable per-user storage accounting if needed.

## Appendix C: Monorepo Structure

```
imagiverse/
├── client/                    # React SPA (existing)
│   ├── src/
│   │   ├── api/               # TanStack Query hooks + API client
│   │   ├── components/        # Shared UI components
│   │   ├── features/          # Feature-based modules (auth, feed, photo, user, search)
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/               # Utilities, constants
│   │   ├── pages/             # Route pages
│   │   └── stores/            # Zustand stores
│   ├── public/
│   └── package.json
├── server/                    # Fastify API + Workers
│   ├── src/
│   │   ├── config/            # Environment config, constants
│   │   ├── db/                # Drizzle schema, connection, queries
│   │   ├── jobs/              # BullMQ job definitions + workers
│   │   ├── middleware/        # Auth, rate-limit, error handler
│   │   ├── modules/           # Feature modules (auth, photos, feed, users, comments)
│   │   │   └── photos/
│   │   │       ├── photos.routes.ts
│   │   │       ├── photos.service.ts
│   │   │       ├── photos.schema.ts    # Zod schemas
│   │   │       └── photos.test.ts
│   │   ├── plugins/           # Fastify plugins (S3, Redis, etc.)
│   │   ├── server.ts          # API entrypoint
│   │   └── worker.ts          # Worker entrypoint
│   ├── drizzle/               # Migration files
│   └── package.json
├── shared/                    # Shared types + Zod schemas (used by both client and server)
│   ├── src/
│   │   ├── schemas/           # Zod validation schemas
│   │   └── types/             # TypeScript type definitions
│   └── package.json
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile.api
│   └── Dockerfile.worker
├── docs/
│   └── DEVELOPMENT_PLAN.md    # This document
├── .github/
│   └── workflows/
│       └── ci.yml
└── package.json               # Workspace root (npm/pnpm workspaces)
```
