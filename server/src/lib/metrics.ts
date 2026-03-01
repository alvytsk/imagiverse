import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

export const registry = new Registry();

// Node.js process metrics: event loop lag (p50/p90/p99), heap size, GC duration,
// open file descriptors, CPU seconds, resident memory, active handles/requests.
collectDefaultMetrics({ register: registry });

// ── HTTP ─────────────────────────────────────────────────────────────────────

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

// ── BullMQ ───────────────────────────────────────────────────────────────────

export const bullmqJobsTotal = new Counter({
  name: 'bullmq_jobs_total',
  help: 'Total number of BullMQ jobs processed',
  labelNames: ['queue', 'status'] as const,
  registers: [registry],
});

export const bullmqJobsDuration = new Histogram({
  name: 'bullmq_jobs_duration_seconds',
  help: 'Duration of BullMQ jobs in seconds',
  labelNames: ['queue'] as const,
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [registry],
});

export const bullmqJobsWaiting = new Gauge({
  name: 'bullmq_jobs_waiting',
  help: 'Number of BullMQ jobs currently waiting in queue',
  labelNames: ['queue'] as const,
  registers: [registry],
});

// ── Feed cache ───────────────────────────────────────────────────────────────

export const feedCacheHitsTotal = new Counter({
  name: 'feed_cache_hits_total',
  help: 'Total number of feed Redis cache hits',
  registers: [registry],
});

export const feedCacheMissesTotal = new Counter({
  name: 'feed_cache_misses_total',
  help: 'Total number of feed Redis cache misses',
  registers: [registry],
});
