import { useParams } from '@tanstack/react-router';
import { Camera, Heart, ImageIcon, Lock, MapPin } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AlbumGrid } from '@/components/albums/album-grid';
import { CreateAlbumDialog } from '@/components/albums/create-album-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BlurhashImage } from '@/components/ui/blurhash-image';
import { TransitionLink } from '@/components/ui/transition-link';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser, useUserPhotos } from '@/hooks/use-users';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

type Tab = 'photos' | 'albums';

export function UserProfilePage() {
  const { userId } = useParams({ from: '/users/$userId' });
  const { data: user, isLoading, error } = useUser(userId);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isOwner = !!currentUserId && currentUserId === userId;

  const [activeTab, setActiveTab] = useState<Tab>('photos');
  const [createAlbumOpen, setCreateAlbumOpen] = useState(false);

  const {
    data: photosData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: photosLoading,
  } = useUserPhotos(userId, isOwner);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node || !hasNextPage) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && !isFetchingNextPage) {
            fetchNextPage();
          }
        },
        { rootMargin: '200px' },
      );
      observerRef.current.observe(node);
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg text-destructive">User not found</p>
      </div>
    );
  }

  if (isLoading || !user) {
    return <ProfileSkeleton />;
  }

  const photos = photosData?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      {/* Banner */}
      <div className="relative mb-16">
        <div className="h-32 rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-accent/20" />
        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 sm:left-8 sm:translate-x-0">
          <Avatar className="h-28 w-28 ring-4 ring-background" style={{ viewTransitionName: `avatar-${userId}` }}>
            {user.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt={user.displayName} />
            ) : null}
            <AvatarFallback className="text-3xl">
              {user.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* User info */}
      <div className="flex flex-col items-center sm:items-start gap-2 pb-6 sm:pl-2">
        <h1 className="text-2xl font-bold">{user.displayName}</h1>
        <p className="text-muted-foreground">@{user.username}</p>

        {user.city && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {user.city}
          </p>
        )}

        {user.bio && <p className="text-sm max-w-md">{user.bio}</p>}

        <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-medium mt-1">
          <Camera className="h-4 w-4" />
          {user.photoCount} photos
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-6">
        <TabButton
          active={activeTab === 'photos'}
          onClick={() => setActiveTab('photos')}
          icon={<Camera className="h-4 w-4" />}
          label="Photos"
        />
        <TabButton
          active={activeTab === 'albums'}
          onClick={() => setActiveTab('albums')}
          icon={<ImageIcon className="h-4 w-4" />}
          label="Albums"
        />
      </div>

      {/* Tab content */}
      {activeTab === 'photos' && (
        <>
          {photosLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-xl" />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Camera className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No photos yet</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {photos.map((photo) => (
                  <TransitionLink
                    key={photo.id}
                    to="/photos/$photoId"
                    params={{ photoId: photo.id }}
                    className="group relative aspect-square overflow-hidden rounded-xl bg-muted"
                  >
                    <BlurhashImage
                      blurhash={photo.blurhash}
                      src={photo.thumbnails.medium ?? photo.thumbnails.small ?? ''}
                      alt={photo.caption ?? 'Photo'}
                      className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                      style={{ viewTransitionName: `photo-${photo.id}` }}
                    />
                    {photo.visibility === 'private' && (
                      <span className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                        <Lock className="h-3 w-3" />
                        Private
                      </span>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-300 group-hover:bg-black/30">
                      <span className="flex items-center gap-1.5 text-white text-sm font-medium opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <Heart className="h-4 w-4" />
                        {photo.likeCount}
                      </span>
                    </div>
                  </TransitionLink>
                ))}
              </div>
              <div ref={sentinelRef} className="h-10" />
              {isFetchingNextPage && (
                <div className="flex justify-center py-6">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'albums' && (
        <AlbumGrid
          userId={userId}
          isOwner={isOwner}
          onCreateClick={() => setCreateAlbumOpen(true)}
        />
      )}

      {isOwner && (
        <CreateAlbumDialog
          open={createAlbumOpen}
          onOpenChange={setCreateAlbumOpen}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="relative mb-16">
        <Skeleton className="h-32 rounded-2xl" />
        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 sm:left-8 sm:translate-x-0">
          <Skeleton className="h-28 w-28 rounded-full" />
        </div>
      </div>
      <div className="space-y-3 sm:pl-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-64" />
      </div>
    </div>
  );
}
