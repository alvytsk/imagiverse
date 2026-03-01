# Observability Implementation (V1.6)

## Goal
Make the system fully observable: metrics, alerting, log shipping, tracing — in priority order, fixing the async thumbnail pipeline black box first.

---

## Tasks

- [x] **1. Fix S3 readiness probe**
  Add `HeadBucket` check to `server/src/modules/health/health.routes.ts` alongside existing Postgres + Redis checks.
  → Verify: `GET /api/health/ready` returns `checks.s3: "fail"` when S3 is unreachable.

- [x] **2. Add per-stage timing to thumbnail processor**
  Wrap each pipeline stage in `server/src/jobs/thumbnail.processor.ts` with `Date.now()` diff logged as structured `{ stage, durationMs }`.
  Stages: `download_original`, `read_metadata`, `extract_exif`, `sharp_resize`, `upload_thumbnails`, `db_update`.
  → Verify: `pnpm dev:worker`, upload a photo, logs show 6 stage entries with durations.

- [x] **3. Install prom-client, define metrics registry**
  `pnpm --filter server add prom-client`
  Create `server/src/lib/metrics.ts` — export named counters/gauges/histograms:
  - `http_request_duration_seconds` (histogram, labels: `method`, `route`, `status_code`)
  - `bullmq_jobs_total` (counter, labels: `queue`, `status` — `completed`/`failed`)
  - `bullmq_jobs_duration_seconds` (histogram, labels: `queue`)
  - `bullmq_jobs_waiting` (gauge, labels: `queue`)
  - `feed_cache_hits_total` / `feed_cache_misses_total` (counters)
  → Verify: `prom-client` default registry has metrics listed.

- [x] **4. Expose `/metrics` endpoint + instrument BullMQ**
  In `server/src/server.ts`: register `GET /metrics` route (text/plain, no auth — restrict to internal network in prod).
  In `server/src/jobs/thumbnail.processor.ts` and `server/src/jobs/feed-score.processor.ts`: increment `bullmq_jobs_total` and observe `bullmq_jobs_duration_seconds` on job complete/fail.
  In `server/src/worker.ts`: poll `thumbnailQueue.getJobCounts()` every 15s, set `bullmq_jobs_waiting` gauge.
  → Verify: `curl localhost:3000/metrics` returns Prometheus text format with all defined metrics.

- [x] **5. Instrument feed cache hit/miss**
  In `server/src/modules/feed/feed.service.ts`: increment `feed_cache_hits_total` on Redis cache hit, `feed_cache_misses_total` on miss.
  → Verify: hit the feed endpoint twice; `feed_cache_hits_total` increments on second request.

- [x] **6. Add Prometheus + alerting rules to Docker Compose**
  Add `prometheus` service to `docker/docker-compose.yml`.
  Create `docker/prometheus/prometheus.yml` scraping `api:3000/metrics` and `worker:3001/metrics`.
  Create `docker/prometheus/alerts.yml` with rules from §11.4 of the dev plan:
  - API error rate >5% 5xx over 5min → critical
  - Feed p95 >300ms over 5min → warning
  - `bullmq_jobs_waiting` >1000 for 10min → warning
  - `bullmq_jobs_total{status="failed"}` rate >10% over 1h → critical
  → Verify: `pnpm infra:up`, open Prometheus UI at `:9090`, all alerts listed in inactive state.

- [ ] **7. Log shipping with Vector**
  Add `vector` service to `docker/docker-compose.yml` reading Docker JSON logs from `/var/run/docker.sock`.
  Create `docker/vector/vector.toml`: parse pino JSON, forward to Loki (or file sink for local testing).
  → Verify: `pnpm infra:up`, make an API request, find the structured log in Loki/file with `reqId` field.

- [ ] **8. OpenTelemetry HTTP + async boundary tracing**
  `pnpm --filter server add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-otlp-grpc`
  Create `server/src/lib/tracing.ts` — init OTel SDK before server starts (instrument http, pg, ioredis).
  Add `traceparent` string field to `ThumbnailJobData` in `server/src/jobs/queue.ts`.
  In upload handler: serialize current span context into `traceparent` when enqueuing job.
  In `thumbnail.processor.ts`: deserialize `traceparent`, create a linked span (not child) for the async processing trace.
  Add `jaeger` service to `docker/docker-compose.yml`.
  → Verify: upload a photo, find the HTTP upload trace in Jaeger UI at `:16686`; find the linked thumbnail processing trace referencing the same `traceparent`.

---

## Done When
- [x] `GET /api/health/ready` checks Postgres, Redis, and S3
- [x] `GET /metrics` returns BullMQ queue metrics and HTTP histograms
- [x] Feed cache hit/miss is tracked in metrics
- [x] Prometheus alert rules are defined and visible in UI
- [ ] Structured logs flow to centralized store (Loki or equivalent)
- [ ] Upload → thumbnail pipeline produces linked spans in Jaeger

## Order Note
Tasks 1–2 are independent quick fixes. Task 3 must precede 4 and 5. Tasks 6–8 are independent of each other but depend on 3–5 being done first.
