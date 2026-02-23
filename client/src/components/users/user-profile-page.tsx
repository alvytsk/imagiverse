import { Link, useParams } from '@tanstack/react-router';
import { Camera, MapPin } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser, useUserPhotos } from '@/hooks/use-users';

export function UserProfilePage() {
  const { userId } = useParams({ from: '/users/$userId' });
  const { data: user, isLoading, error } = useUser(userId);
  const {
    data: photosData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: photosLoading,
  } = useUserPhotos(userId);

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
      <div className="flex flex-col items-center gap-4 pb-8 sm:flex-row sm:items-start sm:gap-8">
        <Avatar className="h-24 w-24 sm:h-32 sm:w-32">
          {user.avatarUrl ? (
            <AvatarImage src={user.avatarUrl} alt={user.displayName} />
          ) : null}
          <AvatarFallback className="text-3xl">
            {user.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-col items-center sm:items-start gap-2">
          <h1 className="text-2xl font-bold">{user.displayName}</h1>
          <p className="text-muted-foreground">@{user.username}</p>

          {user.city && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {user.city}
            </p>
          )}

          {user.bio && <p className="text-sm max-w-md">{user.bio}</p>}

          <div className="flex items-center gap-1 text-sm text-muted-foreground pt-2">
            <Camera className="h-4 w-4" />
            <span>{user.photoCount} photos</span>
          </div>
        </div>
      </div>

      {photosLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Camera className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No photos yet</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((photo) => (
              <Link
                key={photo.id}
                to="/photos/$photoId"
                params={{ photoId: photo.id }}
                className="group relative aspect-square overflow-hidden rounded-lg bg-muted"
              >
                <img
                  src={
                    photo.thumbnails.medium ?? photo.thumbnails.small ?? ''
                  }
                  alt={photo.caption ?? 'Photo'}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              </Link>
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
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-col items-center gap-4 pb-8 sm:flex-row sm:items-start sm:gap-8">
        <Skeleton className="h-24 w-24 rounded-full sm:h-32 sm:w-32" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-16 w-64" />
        </div>
      </div>
    </div>
  );
}
