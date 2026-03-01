import { useMutation, useQueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  PaginatedResponse,
  PhotoResponse,
  PublicUser,
} from 'imagiverse-shared';

import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

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

export function useUploadAvatar(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blob: Blob) => {
      const formData = new FormData();
      formData.append('file', blob, 'avatar.webp');
      return api.post<{ avatarUrl: string | null }>('/users/me/avatar', formData);
    },
    onSuccess: ({ avatarUrl }) => {
      // Sync the new presigned URL into the Zustand auth store so the navbar
      // avatar updates immediately without a page reload.
      const current = useAuthStore.getState().user;
      if (current) useAuthStore.getState().setUser({ ...current, avatarUrl });
      queryClient.invalidateQueries({ queryKey: ['users', userId] });
    },
  });
}

export function useDeleteAvatar(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>('/users/me/avatar'),
    onSuccess: () => {
      const current = useAuthStore.getState().user;
      if (current) useAuthStore.getState().setUser({ ...current, avatarUrl: null });
      queryClient.invalidateQueries({ queryKey: ['users', userId] });
    },
  });
}

export function useUploadBanner(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blob: Blob) => {
      const formData = new FormData();
      formData.append('file', blob, 'banner.webp');
      return api.post<{ bannerUrl: string | null }>('/users/me/banner', formData);
    },
    onSuccess: ({ bannerUrl }) => {
      const current = useAuthStore.getState().user;
      if (current) useAuthStore.getState().setUser({ ...current, bannerUrl });
      queryClient.invalidateQueries({ queryKey: ['users', userId] });
    },
  });
}

export function useDeleteBanner(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>('/users/me/banner'),
    onSuccess: () => {
      const current = useAuthStore.getState().user;
      if (current) useAuthStore.getState().setUser({ ...current, bannerUrl: null });
      queryClient.invalidateQueries({ queryKey: ['users', userId] });
    },
  });
}
