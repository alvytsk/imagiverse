import { useInfiniteQuery } from '@tanstack/react-query';
import type { FeedItemResponse, PaginatedResponse } from 'imagiverse-shared';

import { api } from '@/lib/api-client';

export function useFeed(limit = 20) {
  return useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (pageParam) params.set('cursor', pageParam);
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
  });
}
