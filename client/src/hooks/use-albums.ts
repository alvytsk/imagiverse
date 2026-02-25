import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AlbumResponse,
  CreateAlbumInput,
  PhotoResponse,
} from 'imagiverse-shared';
import { toast } from 'sonner';

import { api, ApiClientError } from '@/lib/api-client';

export function useUserAlbums(userId: string) {
  return useQuery({
    queryKey: ['users', userId, 'albums'],
    queryFn: () =>
      api.get<{ data: AlbumResponse[] }>(`/users/${userId}/albums`, { auth: false }),
    select: (res) => res.data,
    enabled: !!userId,
  });
}

export function useAlbumDetail(albumId: string) {
  return useQuery({
    queryKey: ['albums', albumId],
    queryFn: () =>
      api.get<{ album: AlbumResponse; photos: PhotoResponse[] }>(
        `/albums/${albumId}`,
        { auth: false },
      ),
    enabled: !!albumId,
  });
}

export function useCreateAlbum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAlbumInput) =>
      api.post<AlbumResponse>('/albums', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Альбом создан');
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        toast.error(err.message);
      } else {
        toast.error('Не удалось создать альбом');
      }
    },
  });
}

export function useDeleteAlbum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (albumId: string) => api.delete(`/albums/${albumId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Альбом удалён');
    },
    onError: () => {
      toast.error('Не удалось удалить альбом');
    },
  });
}

export function useAddPhotoToAlbum(albumId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (photoId: string) =>
      api.post(`/albums/${albumId}/photos`, { photoId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums', albumId] });
      toast.success('Фото добавлено в альбом');
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        toast.error(err.message);
      } else {
        toast.error('Не удалось добавить фото');
      }
    },
  });
}

export function useRemovePhotoFromAlbum(albumId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (photoId: string) =>
      api.delete(`/albums/${albumId}/photos/${photoId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums', albumId] });
    },
    onError: () => {
      toast.error('Не удалось удалить фото из альбома');
    },
  });
}
