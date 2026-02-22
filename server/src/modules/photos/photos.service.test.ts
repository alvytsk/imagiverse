/**
 * Unit tests for photos service functions.
 * DB, Redis, S3, and queue are mocked — no real I/O.
 */

// ── Module mocks (hoisted before any imports) ────────────────────────────────

vi.mock('../../plugins/redis', () => ({
  redis: { incr: vi.fn(), expire: vi.fn() },
  RedisKeys: { uploadRate: (id: string) => `upload-rate:${id}` },
}));

vi.mock('../../db/index', () => {
  const returningFn = vi.fn();
  const whereFn = vi.fn(() => ({ returning: returningFn }));
  const setFn = vi.fn(() => ({ where: whereFn }));
  const valuesFn = vi.fn(() => ({ returning: returningFn }));
  return {
    db: {
      insert: vi.fn(() => ({ values: valuesFn })),
      update: vi.fn(() => ({ set: setFn })),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn() })) })) })),
    },
    __mocks: { returningFn, whereFn, setFn, valuesFn },
  };
});

vi.mock('../../plugins/s3', () => ({
  uploadObject: vi.fn(),
  getPresignedDownloadUrl: vi.fn(),
  S3Keys: {
    original: (uid: string, pid: string, ext: string) => `originals/${uid}/${pid}.${ext}`,
    thumbSmall: (pid: string) => `thumbs/${pid}/small.webp`,
    thumbMedium: (pid: string) => `thumbs/${pid}/medium.webp`,
    thumbLarge: (pid: string) => `thumbs/${pid}/large.webp`,
  },
}));

vi.mock('../../jobs/queue', () => ({
  thumbnailQueue: { add: vi.fn() },
  THUMBNAIL_QUEUE_NAME: 'generate-thumbnails',
}));

import { checkUploadRateLimit, mimeToExtension, sanitizeCaption } from './photos.service';

// ── sanitizeCaption ──────────────────────────────────────────────────────────

describe('sanitizeCaption', () => {
  it('strips HTML tags and preserves plain text', () => {
    expect(sanitizeCaption('Hello <b>world</b>')).toBe('Hello world');
  });

  it('handles XSS payloads', () => {
    expect(sanitizeCaption('<script>alert("xss")</script>Safe text')).toBe('Safe text');
  });

  it('returns empty string for tags-only input', () => {
    expect(sanitizeCaption('<div><p></p></div>')).toBe('');
  });

  it('preserves plain text unchanged', () => {
    expect(sanitizeCaption('Just a normal caption')).toBe('Just a normal caption');
  });

  it('handles nested malicious attributes', () => {
    expect(sanitizeCaption('<img src=x onerror=alert(1)>')).toBe('');
  });
});

// ── mimeToExtension ──────────────────────────────────────────────────────────

describe('mimeToExtension', () => {
  it('maps image/jpeg to jpg', () => {
    expect(mimeToExtension('image/jpeg')).toBe('jpg');
  });

  it('maps image/png to png', () => {
    expect(mimeToExtension('image/png')).toBe('png');
  });

  it('maps image/webp to webp', () => {
    expect(mimeToExtension('image/webp')).toBe('webp');
  });

  it('maps image/heic to heic', () => {
    expect(mimeToExtension('image/heic')).toBe('heic');
  });

  it('maps image/heif to heif', () => {
    expect(mimeToExtension('image/heif')).toBe('heif');
  });

  it('returns bin for unknown MIME type', () => {
    expect(mimeToExtension('application/pdf')).toBe('bin');
  });
});

// ── checkUploadRateLimit ─────────────────────────────────────────────────────

describe('checkUploadRateLimit', () => {
  let redis: { incr: ReturnType<typeof vi.fn>; expire: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../plugins/redis');
    redis = mod.redis as unknown as typeof redis;
  });

  it('allows upload when count is under limit', async () => {
    redis.incr.mockResolvedValue(1);
    redis.expire.mockResolvedValue(1);

    const allowed = await checkUploadRateLimit('user-1');
    expect(allowed).toBe(true);
    expect(redis.incr).toHaveBeenCalledWith('upload-rate:user-1');
  });

  it('sets TTL on first increment', async () => {
    redis.incr.mockResolvedValue(1);
    redis.expire.mockResolvedValue(1);

    await checkUploadRateLimit('user-1');
    expect(redis.expire).toHaveBeenCalledWith('upload-rate:user-1', 3600);
  });

  it('does not reset TTL on subsequent increments', async () => {
    redis.incr.mockResolvedValue(5);

    await checkUploadRateLimit('user-1');
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('rejects when limit is exceeded', async () => {
    redis.incr.mockResolvedValue(31);

    const allowed = await checkUploadRateLimit('user-1');
    expect(allowed).toBe(false);
  });

  it('allows exactly the 30th upload', async () => {
    redis.incr.mockResolvedValue(30);

    const allowed = await checkUploadRateLimit('user-1');
    expect(allowed).toBe(true);
  });
});
