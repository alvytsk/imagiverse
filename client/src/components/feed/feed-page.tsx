import { Link } from '@tanstack/react-router';
import type { FeedItemResponse } from 'imagiverse-shared';
import { Heart, MessageCircle } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useFeed } from '@/hooks/use-feed';

export function FeedPage() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useFeed();

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
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg text-destructive mb-2">Failed to load feed</p>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (isLoading) {
    return <FeedSkeleton />;
  }

  const photos = data?.pages.flatMap((p) => p.data) ?? [];

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium mb-2">No photos yet</p>
        <p className="text-muted-foreground">
          Be the first to upload a photo!
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
        {photos.map((photo) => (
          <FeedCard key={photo.id} photo={photo} />
        ))}
      </div>
      <div ref={sentinelRef} className="h-10" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}

function FeedCard({ photo }: { photo: FeedItemResponse }) {
  const aspectRatio =
    photo.width && photo.height ? photo.height / photo.width : 1;
  const paddingBottom = `${Math.min(aspectRatio * 100, 150)}%`;

  return (
    <div className="mb-4 break-inside-avoid">
      <Link
        to="/photos/$photoId"
        params={{ photoId: photo.id }}
        className="group block overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md"
      >
        <div className="relative" style={{ paddingBottom }}>
          <img
            src={photo.thumbnails.medium ?? photo.thumbnails.small ?? ''}
            alt={photo.caption ?? 'Photo'}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between p-3 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex items-center gap-3 text-white text-sm">
              <span className="flex items-center gap-1">
                <Heart className="h-4 w-4" />
                {photo.likeCount}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="h-4 w-4" />
                {photo.commentCount}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3">
          <Avatar className="h-6 w-6">
            {photo.author.avatarUrl ? (
              <AvatarImage src={photo.author.avatarUrl} />
            ) : null}
            <AvatarFallback className="text-xs">
              {photo.author.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium truncate">
            {photo.author.displayName}
          </span>
        </div>
      </Link>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="mb-4 break-inside-avoid">
          <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <Skeleton
              className="w-full"
              style={{ paddingBottom: `${80 + Math.random() * 60}%` }}
            />
            <div className="flex items-center gap-2 p-3">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
