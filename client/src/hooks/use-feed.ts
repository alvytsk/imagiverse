import { useInfiniteQuery } from '@tanstack/react-query';
import type { FeedItemResponse, PaginatedResponse } from 'imagiverse-shared';

import { api } from '@/lib/api-client';

export function useFeed(limit = 20, category?: string) {
  return useInfiniteQuery({
    queryKey: ['feed', { category }],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (pageParam) params.set('cursor', pageParam);
      if (category) params.set('category', category);
      return api.get<PaginatedResponse<FeedItemResponse>>(
        `/feed?${params}`,
        { auth: false },
      );
    },
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore
        ? lastPage.pagination.nextCursor
        : undefined,
    initialPageParam: '' as string,
    staleTime: 5 * 60_000, // presigned URLs are cached 55 min server-side; 5 min is safe
  });
}
