/**
 * Unit tests for categories service functions.
 * DB is mocked — no real I/O.
 */

// ── Module mocks ─────────────────────────────────────────────────────────────

const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ orderBy: mockOrderBy, where: mockWhere }));

vi.mock('../../db/index', () => ({
  db: {
    select: () => ({ from: mockFrom }),
  },
}));

vi.mock('../../plugins/redis', () => ({
  redis: {},
  RedisKeys: {},
}));

import { getAllCategories, getCategoryById, getCategoryBySlug } from './categories.service';

// ── getAllCategories ─────────────────────────────────────────────────────────

describe('getAllCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns results from DB ordered by displayOrder', async () => {
    const mockCategories = [
      {
        id: '1',
        name: 'Landscape',
        slug: 'landscape',
        displayOrder: 1,
        iconName: null,
        createdAt: new Date(),
      },
      {
        id: '2',
        name: 'Portrait',
        slug: 'portrait',
        displayOrder: 2,
        iconName: null,
        createdAt: new Date(),
      },
    ];
    mockOrderBy.mockReturnValue(mockCategories);

    const result = await getAllCategories();
    expect(result).toEqual(mockCategories);
    expect(result).toHaveLength(2);
  });
});

// ── getCategoryBySlug ───────────────────────────────────────────────────────

describe('getCategoryBySlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a category when slug matches', async () => {
    const mockCategory = {
      id: '1',
      name: 'Landscape',
      slug: 'landscape',
      displayOrder: 1,
      iconName: null,
      createdAt: new Date(),
    };
    mockLimit.mockReturnValue([mockCategory]);

    const result = await getCategoryBySlug('landscape');
    expect(result).toEqual(mockCategory);
  });

  it('returns null when slug does not match', async () => {
    mockLimit.mockReturnValue([]);

    const result = await getCategoryBySlug('nonexistent');
    expect(result).toBeNull();
  });
});

// ── getCategoryById ─────────────────────────────────────────────────────────

describe('getCategoryById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a category when id matches', async () => {
    const mockCategory = {
      id: '1',
      name: 'Landscape',
      slug: 'landscape',
      displayOrder: 1,
      iconName: null,
      createdAt: new Date(),
    };
    mockLimit.mockReturnValue([mockCategory]);

    const result = await getCategoryById('1');
    expect(result).toEqual(mockCategory);
  });

  it('returns null when id does not match', async () => {
    mockLimit.mockReturnValue([]);

    const result = await getCategoryById('nonexistent');
    expect(result).toBeNull();
  });
});
