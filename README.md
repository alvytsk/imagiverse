# Imagiverse

A photo gallery platform where users upload photos, browse a ranked public feed, like/comment on photos, and search for other users.

## Quick Start

### Local Development (Recommended)

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment
cp .env.example .env

# 3. Start infrastructure (Postgres, Redis, Garage S3)
pnpm infra:up

# 4. Initialize Garage bucket and access key (first time only)
docker compose -f docker/docker-compose.yml run --rm garage-init

# 5. In separate terminals:
pnpm dev:api        # Fastify API (http://localhost:3000)
pnpm dev:worker     # BullMQ worker for image processing
cd client && pnpm dev  # Vite dev server (http://localhost:5173)
```

### Full Stack in Docker

```bash
docker compose -f docker/docker-compose.yml up
```

## Features

- **Photo Upload & Processing** — Upload images with automatic thumbnail generation
- **Ranked Feed** — Browse photos sorted by gravity-based scoring (likes + recency)
- **Interactions** — Like and comment on photos in real time
- **User Profiles** — View user photos, bios, and search by username
- **Search** — Case-insensitive, diacritics-insensitive trigram search on users and photos
- **Authentication** — JWT access tokens + refresh tokens with Redis invalidation

## Architecture

```
Client (React 19 SPA)
  ↓ API calls
Server (Fastify 5)
  ├─ PostgreSQL 16 (Drizzle ORM)
  ├─ Redis 7 (cache, rate limiting, BullMQ)
  └─ Garage S3 (object storage)

Worker (BullMQ)
  └─ Sharp (image processing)
```

**Monorepo Structure:**
- `client/` — React 19 SPA with Vite 7 and TypeScript
- `server/` — Fastify API + BullMQ worker (CommonJS)
- `shared/` — Zod schemas + TypeScript types (used by client and server)
- `docker/` — Docker Compose, Dockerfiles, Garage config
- `docs/` — Architecture and development roadmap
- `e2e/` — Playwright integration tests

## Development Commands

### Setup & Infrastructure

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install all workspace dependencies |
| `pnpm infra:up` | Start Postgres, Redis, Garage v2 |
| `pnpm infra:down` | Stop all infrastructure |
| `docker compose -f docker/docker-compose.yml run --rm garage-init` | Initialize Garage bucket (first time) |

### Development

| Command | Purpose |
|---------|---------|
| `pnpm dev:api` | Start Fastify API with hot reload |
| `pnpm dev:worker` | Start BullMQ worker with hot reload |
| `cd client && pnpm dev` | Start Vite dev server |

### Building

| Command | Purpose |
|---------|---------|
| `pnpm build` | Build shared + server to TypeScript → dist/ |
| `pnpm build:client` | Build client SPA for production |
| `pnpm docker:build` | Build Docker images for API + Worker |

### Testing

| Command | Purpose |
|---------|---------|
| `pnpm test` | Run all unit tests (124 tests) |
| `pnpm --filter server test:watch` | Run server tests in watch mode |
| `pnpm test:integration` | Run integration tests (requires Docker) |
| `pnpm test:e2e` | Run E2E tests with Playwright |
| `pnpm test:e2e:ui` | Open Playwright UI test runner |

### Database

| Command | Purpose |
|---------|---------|
| `pnpm --filter server db:generate` | Generate migration after schema changes |
| `pnpm --filter server db:migrate` | Run pending migrations |
| `pnpm --filter server db:studio` | Open Drizzle Studio (visual browser) |
| `pnpm seed` | Seed database (100 users, 1000 photos) |

### Code Quality

| Command | Purpose |
|---------|---------|
| `pnpm lint` | Check code with Biome |
| `pnpm lint:fix` | Auto-fix linting issues |
| `pnpm format` | Format code |
| `pnpm type-check` | Run TypeScript checks on server + shared |

## Project Status

**MVP Complete** — All 9 core features (M1–M9) are implemented.

See `docs/DEVELOPMENT_PLAN.md` for the full architecture roadmap and feature breakdown.

## Key Conventions

- **Environment variables** — Validated in `server/src/config/env.ts`; never access `process.env` directly
- **Object storage** — Use `S3Keys` helpers (not hand-crafted strings); follow convention: `originals/{userId}/{photoId}.{ext}` and `thumbs/{photoId}/small|medium|large.webp`
- **Text sanitization** — Sanitize all user input (comments, captions, bio) server-side with `sanitize-html`
- **Migrations** — Forward-only; fix mistakes with new migrations, never revert
- **Feature modules** — Each feature in `server/src/modules/<feature>/` with routes, services, schemas, and tests

## Configuration

All configuration is managed through environment variables. Copy `.env.example` to `.env` and customize as needed:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | localhost:5432 |
| `REDIS_URL` | Redis connection string | localhost:6379 |
| `S3_ENDPOINT` | S3-compatible endpoint (Garage) | localhost:9000 |
| `S3_ACCESS_KEY` | S3 access key | — |
| `S3_SECRET_KEY` | S3 secret key | — |
| `NODE_ENV` | Environment | development |

## Contributing

1. Create a feature branch from `main`
2. Write tests for new functionality
3. Ensure all tests pass: `pnpm test && pnpm test:integration`
4. Run linting: `pnpm lint:fix`
5. Open a pull request with a clear description

## Resources

- **Architecture & Roadmap** — [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)
- **Project Instructions** — [CLAUDE.md](CLAUDE.md)
- **Test Helpers** — [server/src/test-helpers/](server/src/test-helpers/)
- **E2E Tests** — [e2e/mvp-journey.spec.ts](e2e/mvp-journey.spec.ts)

## License

MIT
