/**
 * Unit tests for the thumbnail processor.
 * Sharp, S3, and DB are mocked — no real I/O.
 */

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../plugins/redis', () => ({
  redis: {},
  RedisKeys: {},
}));

const mockDb = vi.hoisted(() => {
  const returningFn = vi.fn();
  const whereFn = vi.fn(() => ({ returning: returningFn }));
  const setFn = vi.fn(() => ({ where: whereFn }));
  return {
    update: vi.fn(() => ({ set: setFn })),
    __mocks: { setFn, whereFn, returningFn },
  };
});

vi.mock('../db/index', () => ({ db: mockDb }));

const mockS3 = vi.hoisted(() => ({
  downloadObject: vi.fn(),
  uploadObject: vi.fn(),
  S3Keys: {
    thumbSmall: (pid: string) => `thumbs/${pid}/small.webp`,
    thumbMedium: (pid: string) => `thumbs/${pid}/medium.webp`,
    thumbLarge: (pid: string) => `thumbs/${pid}/large.webp`,
  },
}));

vi.mock('../plugins/s3', () => mockS3);

vi.mock('./queue', () => ({
  bullConnection: { host: 'localhost', port: 6379, maxRetriesPerRequest: null },
  THUMBNAIL_QUEUE_NAME: 'generate-thumbnails',
}));

// Mock sharp: returns a chainable object with metadata(), rotate(), resize(), webp(), toBuffer()
const mockSharpInstance = vi.hoisted(() => {
  const instance = {
    metadata: vi.fn(),
    rotate: vi.fn(),
    resize: vi.fn(),
    webp: vi.fn(),
    toBuffer: vi.fn(),
  };
  // Chain returns
  instance.rotate.mockReturnValue(instance);
  instance.resize.mockReturnValue(instance);
  instance.webp.mockReturnValue(instance);
  return instance;
});

vi.mock('sharp', () => {
  const sharpFn = vi.fn(() => mockSharpInstance) as ReturnType<typeof vi.fn> & {
    limitInputPixels: number;
  };
  sharpFn.limitInputPixels = 0;
  return { default: sharpFn };
});

import type { Job } from 'bullmq';
import type { ThumbnailJobData } from './queue';
import { processThumbnailJob } from './thumbnail.processor';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeJob(
  data: ThumbnailJobData,
  overrides?: Partial<Job<ThumbnailJobData>>
): Job<ThumbnailJobData> {
  return {
    data,
    id: `thumb-${data.photoId}`,
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  } as unknown as Job<ThumbnailJobData>;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('processThumbnailJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: valid image download
    mockS3.downloadObject.mockResolvedValue(Buffer.from('fake-image-data'));
    mockS3.uploadObject.mockResolvedValue(undefined);

    // Default: valid metadata
    mockSharpInstance.metadata.mockResolvedValue({ width: 3000, height: 2000, format: 'jpeg' });
    mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('thumbnail-data'));
  });

  it('downloads original, generates 3 thumbnails, uploads them, and updates DB', async () => {
    const job = makeJob({
      photoId: 'photo-1',
      originalKey: 'originals/user-1/photo-1.jpg',
      userId: 'user-1',
    });

    await processThumbnailJob(job);

    // Should download original
    expect(mockS3.downloadObject).toHaveBeenCalledWith('originals/user-1/photo-1.jpg');

    // Should upload 3 thumbnails
    expect(mockS3.uploadObject).toHaveBeenCalledTimes(3);
    expect(mockS3.uploadObject).toHaveBeenCalledWith(
      'thumbs/photo-1/small.webp',
      expect.any(Buffer),
      'image/webp'
    );
    expect(mockS3.uploadObject).toHaveBeenCalledWith(
      'thumbs/photo-1/medium.webp',
      expect.any(Buffer),
      'image/webp'
    );
    expect(mockS3.uploadObject).toHaveBeenCalledWith(
      'thumbs/photo-1/large.webp',
      expect.any(Buffer),
      'image/webp'
    );

    // Should update DB with status='ready' and thumbnail keys
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.__mocks.setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ready',
        thumbSmallKey: 'thumbs/photo-1/small.webp',
        thumbMediumKey: 'thumbs/photo-1/medium.webp',
        thumbLargeKey: 'thumbs/photo-1/large.webp',
        width: 3000,
        height: 2000,
      })
    );
  });

  it('throws on corrupt image (no width/height in metadata)', async () => {
    mockSharpInstance.metadata.mockResolvedValue({ format: 'jpeg' });

    const job = makeJob({
      photoId: 'photo-2',
      originalKey: 'originals/user-1/photo-2.jpg',
      userId: 'user-1',
    });

    await expect(processThumbnailJob(job)).rejects.toThrow('Invalid image metadata');
  });

  it('throws when Sharp metadata call fails', async () => {
    mockSharpInstance.metadata.mockRejectedValue(
      new Error('Input buffer contains unsupported image format')
    );

    const job = makeJob({
      photoId: 'photo-3',
      originalKey: 'originals/user-1/photo-3.jpg',
      userId: 'user-1',
    });

    await expect(processThumbnailJob(job)).rejects.toThrow();
  });

  it('throws when S3 download fails', async () => {
    mockS3.downloadObject.mockRejectedValue(new Error('NoSuchKey'));

    const job = makeJob({
      photoId: 'photo-4',
      originalKey: 'originals/user-1/photo-4.jpg',
      userId: 'user-1',
    });

    await expect(processThumbnailJob(job)).rejects.toThrow('NoSuchKey');
  });

  it('calls resize with withoutEnlargement: true', async () => {
    const job = makeJob({
      photoId: 'photo-5',
      originalKey: 'originals/user-1/photo-5.jpg',
      userId: 'user-1',
    });

    await processThumbnailJob(job);

    // 3 sizes × 1 call each = 3 resize calls
    expect(mockSharpInstance.resize).toHaveBeenCalledTimes(3);
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(256, undefined, {
      withoutEnlargement: true,
    });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(800, undefined, {
      withoutEnlargement: true,
    });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(1600, undefined, {
      withoutEnlargement: true,
    });
  });

  it('calls rotate() before resize() to respect EXIF orientation', async () => {
    const callOrder: string[] = [];
    mockSharpInstance.rotate.mockImplementation(() => {
      callOrder.push('rotate');
      return mockSharpInstance;
    });
    mockSharpInstance.resize.mockImplementation(() => {
      callOrder.push('resize');
      return mockSharpInstance;
    });

    const job = makeJob({
      photoId: 'photo-6',
      originalKey: 'originals/user-1/photo-6.jpg',
      userId: 'user-1',
    });

    await processThumbnailJob(job);

    // For each thumbnail, rotate should come before resize
    for (let i = 0; i < callOrder.length; i += 2) {
      expect(callOrder[i]).toBe('rotate');
      expect(callOrder[i + 1]).toBe('resize');
    }
  });
});
