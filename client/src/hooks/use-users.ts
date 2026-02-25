import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  PaginatedResponse,
  PhotoResponse,
  PublicUser,
} from 'imagiverse-shared';

import { api } from '@/lib/api-client';

export function useUser(userId: string) {
  return useQuery({
    queryKey: ['users', userId],
    queryFn: () =>
      api.get<PublicUser>(`/users/${userId}`, { auth: false }),
    enabled: !!userId,
  });
}

export function useUserPhotos(userId: string, isOwner = false) {
  return useInfiniteQuery({
    queryKey: ['users', userId, 'photos', isOwner],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', pageParam);
      return api.get<PaginatedResponse<PhotoResponse>>(
        `/users/${userId}/photos?${params}`,
        { auth: isOwner },
      );
    },
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore
        ? lastPage.pagination.nextCursor
        : undefined,
    initialPageParam: '' as string,
  });
}

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ['users', 'search', query],
    queryFn: () => {
      const params = new URLSearchParams({ q: query, limit: '20' });
      return api.get<{ data: PublicUser[] }>(
        `/users/search?${params}`,
        { auth: false },
      );
    },
    enabled: query.length >= 2,
  });
}
