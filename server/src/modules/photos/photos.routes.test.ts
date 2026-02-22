/**
 * Route-level tests for the photos endpoints.
 *
 * The entire photos.service module is mocked so these tests exercise only the
 * HTTP layer (request parsing, status codes, response shapes, auth handling)
 * without touching a real database, Redis, or S3.
 */

import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach } from 'vitest';

// ── Module mocks (hoisted before any imports) ────────────────────────────────

vi.mock('../../plugins/redis', () => ({
  redis: { incr: vi.fn(), expire: vi.fn() },
  RedisKeys: { uploadRate: (id: string) => `upload-rate:${id}` },
}));

vi.mock('../../db/index', () => ({ db: {} }));

vi.mock('../../plugins/s3', () => ({
  uploadObject: vi.fn(),
  getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned'),
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

vi.mock('sharp', () => {
  const sharpFn = vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({ format: 'jpeg', width: 100, height: 100 }),
  }));
  return { default: sharpFn };
});

const mockService = vi.hoisted(() => ({
  uploadPhoto: vi.fn(),
  getPhotoById: vi.fn(),
  buildPhotoResponse: vi.fn(),
  updateCaption: vi.fn(),
  softDeletePhoto: vi.fn(),
  checkUploadRateLimit: vi.fn(),
  sanitizeCaption: vi.fn((t: string) => t),
  mimeToExtension: vi.fn(() => 'jpg'),
}));

vi.mock('./photos.service', () => mockService);

import { photoRoutes } from './photos.routes';

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateAuthToken(userId = 'user-uuid-1') {
  return jwt.sign({ id: userId, role: 'user' }, process.env.JWT_SECRET!, { expiresIn: '15m' });
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(photoRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

// Create a minimal JPEG buffer (smallest valid JPEG: SOI + EOI markers)
function createMinimalJpeg(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

function buildMultipartPayload(fileBuffer: Buffer, mimeType: string, caption?: string) {
  const boundary = '----TestBoundary123456';
  const parts: Buffer[] = [];

  if (caption != null) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`
      )
    );
  }

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\nContent-Type: ${mimeType}\r\n\r\n`
    )
  );
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return {
    payload: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// ── Default mock setup ───────────────────────────────────────────────────────

const TEST_PHOTO = {
  id: 'photo-uuid-1',
  userId: 'user-uuid-1',
  caption: 'Test caption',
  status: 'ready',
  originalKey: 'originals/user-uuid-1/photo-uuid-1.jpg',
  thumbSmallKey: 'thumbs/photo-uuid-1/small.webp',
  thumbMediumKey: 'thumbs/photo-uuid-1/medium.webp',
  thumbLargeKey: 'thumbs/photo-uuid-1/large.webp',
  width: 1920,
  height: 1080,
  sizeBytes: 1024000,
  mimeType: 'image/jpeg',
  likeCount: 0,
  commentCount: 0,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const TEST_PHOTO_RESPONSE = {
  id: 'photo-uuid-1',
  userId: 'user-uuid-1',
  caption: 'Test caption',
  status: 'ready',
  thumbnails: {
    small: 'https://s3.example.com/small',
    medium: 'https://s3.example.com/medium',
    large: 'https://s3.example.com/large',
  },
  width: 1920,
  height: 1080,
  likeCount: 0,
  commentCount: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function setupDefaultMocks() {
  mockService.checkUploadRateLimit.mockResolvedValue(true);
  mockService.uploadPhoto.mockResolvedValue({ id: 'photo-uuid-1', status: 'processing' });
  mockService.getPhotoById.mockResolvedValue(TEST_PHOTO);
  mockService.buildPhotoResponse.mockResolvedValue(TEST_PHOTO_RESPONSE);
  mockService.updateCaption.mockResolvedValue(TEST_PHOTO);
  mockService.softDeletePhoto.mockResolvedValue(true);
}

// ── POST /api/photos ─────────────────────────────────────────────────────────

describe('POST /api/photos', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 201 on successful upload', async () => {
    const jpeg = createMinimalJpeg();
    const { payload, contentType } = buildMultipartPayload(jpeg, 'image/jpeg', 'My photo');

    const response = await app.inject({
      method: 'POST',
      url: '/api/photos',
      headers: {
        authorization: `Bearer ${generateAuthToken()}`,
        'content-type': contentType,
      },
      payload,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.id).toBe('photo-uuid-1');
    expect(body.status).toBe('processing');
  });

  it('returns 401 without auth token', async () => {
    const jpeg = createMinimalJpeg();
    const { payload, contentType } = buildMultipartPayload(jpeg, 'image/jpeg');

    const response = await app.inject({
      method: 'POST',
      url: '/api/photos',
      headers: { 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockService.checkUploadRateLimit.mockResolvedValue(false);

    const jpeg = createMinimalJpeg();
    const { payload, contentType } = buildMultipartPayload(jpeg, 'image/jpeg');

    const response = await app.inject({
      method: 'POST',
      url: '/api/photos',
      headers: {
        authorization: `Bearer ${generateAuthToken()}`,
        'content-type': contentType,
      },
      payload,
    });

    expect(response.statusCode).toBe(429);
    expect(response.json().error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('returns 400 for unsupported MIME type', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 fake pdf content');
    const { payload, contentType } = buildMultipartPayload(pdfBuffer, 'application/pdf');

    const response = await app.inject({
      method: 'POST',
      url: '/api/photos',
      headers: {
        authorization: `Bearer ${generateAuthToken()}`,
        'content-type': contentType,
      },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_FILE_TYPE');
  });
});

// ── GET /api/photos/:id ──────────────────────────────────────────────────────

describe('GET /api/photos/:id', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with photo response for an existing photo', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/photos/photo-uuid-1',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe('photo-uuid-1');
    expect(body.thumbnails).toBeDefined();
  });

  it('returns 404 when photo does not exist', async () => {
    mockService.getPhotoById.mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/photos/nonexistent',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for a deleted photo', async () => {
    mockService.getPhotoById.mockResolvedValue({ ...TEST_PHOTO, status: 'deleted' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/photos/photo-uuid-1',
    });

    expect(response.statusCode).toBe(404);
  });

  it('does not require authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/photos/photo-uuid-1',
    });

    expect(response.statusCode).toBe(200);
  });
});

// ── PATCH /api/photos/:id ────────────────────────────────────────────────────

describe('PATCH /api/photos/:id', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with updated photo on valid caption update', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/photos/photo-uuid-1',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { caption: 'Updated caption' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockService.updateCaption).toHaveBeenCalledWith(
      'photo-uuid-1',
      'user-uuid-1',
      'Updated caption'
    );
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/photos/photo-uuid-1',
      payload: { caption: 'Updated caption' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when photo is not found or not owned', async () => {
    mockService.updateCaption.mockResolvedValue(null);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/photos/photo-uuid-1',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { caption: 'New caption' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 400 for caption exceeding max length', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/photos/photo-uuid-1',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
      payload: { caption: 'x'.repeat(2001) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });
});

// ── DELETE /api/photos/:id ───────────────────────────────────────────────────

describe('DELETE /api/photos/:id', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 204 on successful deletion', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/photos/photo-uuid-1',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(204);
    expect(mockService.softDeletePhoto).toHaveBeenCalledWith('photo-uuid-1', 'user-uuid-1');
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/photos/photo-uuid-1',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when photo is not found or not owned', async () => {
    mockService.softDeletePhoto.mockResolvedValue(false);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/photos/photo-uuid-1',
      headers: { authorization: `Bearer ${generateAuthToken()}` },
    });

    expect(response.statusCode).toBe(404);
  });
});
