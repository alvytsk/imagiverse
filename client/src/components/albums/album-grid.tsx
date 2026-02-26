import type { AlbumResponse } from 'imagiverse-shared';
import { ImageIcon, Plus } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserAlbums } from '@/hooks/use-albums';

function AlbumCard({ album }: { album: AlbumResponse }) {
  return (
    <Link
      to="/albums/$albumId"
      params={{ albumId: album.id }}
      className="group relative overflow-hidden rounded-xl bg-muted"
    >
      <div className="aspect-square">
        {album.coverUrl ? (
          <img
            src={album.coverUrl}
            alt={album.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="text-sm font-semibold text-white truncate">{album.name}</p>
        <p className="text-xs text-white/70">{album.photoCount} photos</p>
      </div>
    </Link>
  );
}

export function AlbumGrid({
  userId,
  isOwner,
  onCreateClick,
}: {
  userId: string;
  isOwner: boolean;
  onCreateClick: () => void;
}) {
  const { data: albums, isLoading } = useUserAlbums(userId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    );
  }

  if (!albums || albums.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium">No albums yet</p>
        {isOwner && (
          <Button onClick={onCreateClick} className="mt-4">
            <Plus className="h-4 w-4 mr-1" />
            Create album
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="flex justify-end">
          <Button onClick={onCreateClick} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Create album
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {albums.map((album) => (
          <AlbumCard key={album.id} album={album} />
        ))}
      </div>
    </div>
  );
}
