import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CommentResponse,
  CreateCommentInput,
  PaginatedResponse,
  PhotoResponse,
} from 'imagiverse-shared';
import { toast } from 'sonner';

import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

export function usePhoto(photoId: string) {
  return useQuery({
    queryKey: ['photos', photoId],
    queryFn: () =>
      api.get<PhotoResponse>(`/photos/${photoId}`, { auth: false }),
    refetchInterval: (query) => {
      if (query.state.data?.status === 'processing') return 2000;
      return false;
    },
  });
}

export function useLikePhoto(photoId: string) {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const likeMutation = useMutation({
    mutationFn: () => api.post(`/photos/${photoId}/like`),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['photos', photoId] });
      const previous = queryClient.getQueryData<PhotoResponse>(['photos', photoId]);
      if (previous) {
        queryClient.setQueryData<PhotoResponse>(['photos', photoId], {
          ...previous,
          likeCount: previous.likeCount + 1,
        });
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['photos', photoId], context.previous);
      }
      if (err instanceof ApiClientError && err.code === 'ALREADY_LIKED') {
        return;
      }
      toast.error('Failed to like photo');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['photos', photoId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  const unlikeMutation = useMutation({
    mutationFn: () => api.delete(`/photos/${photoId}/like`),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['photos', photoId] });
      const previous = queryClient.getQueryData<PhotoResponse>(['photos', photoId]);
      if (previous) {
        queryClient.setQueryData<PhotoResponse>(['photos', photoId], {
          ...previous,
          likeCount: Math.max(0, previous.likeCount - 1),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['photos', photoId], context.previous);
      }
      toast.error('Failed to unlike photo');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['photos', photoId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  return { likeMutation, unlikeMutation, isAuthenticated };
}

export function usePhotoComments(photoId: string) {
  return useInfiniteQuery({
    queryKey: ['photos', photoId, 'comments'],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', pageParam);
      return api.get<PaginatedResponse<CommentResponse>>(
        `/photos/${photoId}/comments?${params}`,
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

export function useAddComment(photoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      api.post<CommentResponse>(`/photos/${photoId}/comments`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['photos', photoId, 'comments'],
      });
      queryClient.invalidateQueries({ queryKey: ['photos', photoId] });
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to add comment');
      }
    },
  });
}

export function useDeleteComment(photoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commentId: string) =>
      api.delete(`/comments/${commentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['photos', photoId, 'comments'],
      });
      queryClient.invalidateQueries({ queryKey: ['photos', photoId] });
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to delete comment');
      }
    },
  });
}
