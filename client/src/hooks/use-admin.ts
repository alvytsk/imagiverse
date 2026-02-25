import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type {
  AdminCommentResponse,
  AdminPhotoResponse,
  AdminStatsResponse,
  AdminUserResponse,
  PaginatedResponse,
  ReportResponse,
} from 'imagiverse-shared';
import { api } from '@/lib/api-client';
import { queryClient } from '@/lib/query-client';

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get<AdminStatsResponse>('/admin/stats'),
    refetchInterval: 30_000,
  });
}

export function useAdminUsers(status: string = 'all') {
  return useInfiniteQuery({
    queryKey: ['admin', 'users', status],
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResponse<AdminUserResponse>>(
        `/admin/users?status=${status}${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: '' as string,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.nextCursor : undefined,
  });
}

export function useAdminPhotos(status: string = 'all') {
  return useInfiniteQuery({
    queryKey: ['admin', 'photos', status],
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResponse<AdminPhotoResponse>>(
        `/admin/photos?status=${status}${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: '' as string,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.nextCursor : undefined,
  });
}

export function useAdminReports(status: string = 'pending') {
  return useInfiniteQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResponse<ReportResponse>>(
        `/admin/reports?status=${status}${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: '' as string,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.nextCursor : undefined,
  });
}

export function useAdminComments(flagged: boolean = false) {
  return useInfiniteQuery({
    queryKey: ['admin', 'comments', flagged],
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResponse<AdminCommentResponse>>(
        `/admin/comments?flagged=${flagged}${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: '' as string,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.nextCursor : undefined,
  });
}

export function useBanUser() {
  return useMutation({
    mutationFn: (userId: string) => api.patch(`/admin/users/${userId}/ban`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useUnbanUser() {
  return useMutation({
    mutationFn: (userId: string) => api.patch(`/admin/users/${userId}/unban`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useAdminDeletePhoto() {
  return useMutation({
    mutationFn: (photoId: string) => api.delete(`/admin/photos/${photoId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useResolveReport() {
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'reviewed' | 'dismissed' }) =>
      api.patch(`/admin/reports/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useAdminDeleteComment() {
  return useMutation({
    mutationFn: (commentId: string) => api.delete(`/admin/comments/${commentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}
