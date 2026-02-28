import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Heart, Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { EditAlbumDialog } from '@/components/albums/edit-album-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BlurhashImage } from '@/components/ui/blurhash-image';
import { TransitionLink } from '@/components/ui/transition-link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAlbumDetail, useDeleteAlbum, useRemovePhotoFromAlbum } from '@/hooks/use-albums';
import { useUser } from '@/hooks/use-users';
import { timeAgo } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

export function AlbumDetailPage() {
  const { albumId } = useParams({ from: '/albums/$albumId' });
  const { data, isLoading, error } = useAlbumDetail(albumId);
  const album = data?.album;
  const photos = data?.photos ?? [];
  const { data: author } = useUser(album?.userId ?? '');
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isOwner = !!currentUserId && currentUserId === album?.userId;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const navigate = useNavigate();
  const deleteAlbum = useDeleteAlbum();
  const removePhoto = useRemovePhotoFromAlbum(albumId);

  const handleDelete = async () => {
    await deleteAlbum.mutateAsync(albumId);
    setDeleteConfirmOpen(false);
    if (album?.userId) {
      navigate({ to: '/users/$userId', params: { userId: album.userId } });
    } else {
      navigate({ to: '/', search: { category: undefined } });
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg text-destructive">Album not found</p>
      </div>
    );
  }

  if (isLoading || !album) {
    return <AlbumDetailSkeleton />;
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 space-y-4">
        <TransitionLink
          to="/users/$userId"
          params={{ userId: album.userId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to profile
        </TransitionLink>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{album.name}</h1>
            {album.description && (
              <p className="text-muted-foreground mt-1">{album.description}</p>
            )}
          </div>
          {isOwner && (
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <TransitionLink to="/users/$userId" params={{ userId: album.userId }}>
            <Avatar className="h-8 w-8" style={{ viewTransitionName: `avatar-${album.userId}` }}>
              {author?.avatarUrl ? (
                <AvatarImage src={author.avatarUrl} alt={author.displayName} />
              ) : null}
              <AvatarFallback className="text-xs">
                {author?.displayName?.charAt(0).toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
          </TransitionLink>
          <div className="text-sm">
            <TransitionLink
              to="/users/$userId"
              params={{ userId: album.userId }}
              className="font-medium hover:underline"
            >
              {author?.displayName ?? 'User'}
            </TransitionLink>
            <span className="text-muted-foreground">
              {' · '}{photos.length} photos{' · '}{timeAgo(album.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Photo grid */}
      {photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium">No photos in this album</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add photos from their detail page.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-square overflow-hidden rounded-xl bg-muted"
            >
              <TransitionLink
                to="/photos/$photoId"
                params={{ photoId: photo.id }}
                className="block h-full w-full"
              >
                <BlurhashImage
                  blurhash={photo.blurhash}
                  src={photo.thumbnails.medium ?? photo.thumbnails.small ?? ''}
                  alt={photo.caption ?? 'Photo'}
                  className="h-full w-full rounded-xl transition-transform duration-300 group-hover:scale-105"
                  style={{ viewTransitionName: `photo-${photo.id}` }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-300 group-hover:bg-black/30">
                  <span className="flex items-center gap-1.5 text-white text-sm font-medium opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <Heart className="h-4 w-4" />
                    {photo.likeCount}
                  </span>
                </div>
              </TransitionLink>
              {isOwner && (
                <button
                  className="absolute top-2 right-2 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removePhoto.mutate(photo.id);
                  }}
                  aria-label="Remove from album"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      {isOwner && editOpen && (
        <EditAlbumDialog
          album={album}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      {/* Delete confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete album?</DialogTitle>
            <DialogDescription>
              This will permanently delete the album "{album.name}". Photos will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteAlbum.isPending}
              isLoading={deleteAlbum.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AlbumDetailSkeleton() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 space-y-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    </div>
  );
}
