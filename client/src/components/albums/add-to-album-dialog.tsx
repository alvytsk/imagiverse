import type { AlbumResponse } from 'imagiverse-shared';
import { Check, ImageIcon, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';

import { CreateAlbumDialog } from '@/components/albums/create-album-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddPhotoToAlbum, useUserAlbums } from '@/hooks/use-albums';

function AlbumRow({
  album,
  photoId,
}: {
  album: AlbumResponse;
  photoId: string;
}) {
  const addPhoto = useAddPhotoToAlbum(album.id);

  return (
    <button
      className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
      onClick={() => addPhoto.mutate(photoId)}
      disabled={addPhoto.isPending || addPhoto.isSuccess}
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
        {album.coverUrl ? (
          <img
            src={album.coverUrl}
            alt={album.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{album.name}</p>
        <p className="text-xs text-muted-foreground">{album.photoCount} photos</p>
      </div>
      {addPhoto.isPending && (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      )}
      {addPhoto.isSuccess && (
        <Check className="h-4 w-4 text-green-500" />
      )}
    </button>
  );
}

export function AddToAlbumDialog({
  photoId,
  userId,
  open,
  onOpenChange,
}: {
  photoId: string;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: albums, isLoading } = useUserAlbums(userId);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add to album</DialogTitle>
            <DialogDescription>
              Choose an album for this photo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1">
            {isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <Skeleton className="h-12 w-12 rounded-lg" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isLoading && albums && albums.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                You don't have any albums yet.
              </p>
            )}

            {albums?.map((album) => (
              <AlbumRow key={album.id} album={album} photoId={photoId} />
            ))}
          </div>
          <Button
            variant="outline"
            className="w-full mt-2"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Create new album
          </Button>
        </DialogContent>
      </Dialog>

      <CreateAlbumDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
