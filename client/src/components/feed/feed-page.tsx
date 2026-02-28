import { Link } from '@tanstack/react-router';
import type { ExifSummary, FeedItemResponse } from 'imagiverse-shared';
import { Camera, Heart, MessageCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BlurhashImage } from '@/components/ui/blurhash-image';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TransitionLink } from '@/components/ui/transition-link';
import { useFeed } from '@/hooks/use-feed';
import { useAuthStore } from '@/stores/auth-store';

// ── Responsive column count (matches Tailwind sm/lg/xl breakpoints) ─────────

function useColumnCount(): number {
  const [count, setCount] = useState(() => {
    if (typeof window === 'undefined') return 1;
    if (window.innerWidth >= 1280) return 4;
    if (window.innerWidth >= 1024) return 3;
    if (window.innerWidth >= 640) return 2;
    return 1;
  });

  useEffect(() => {
    const queries = [
      { mq: window.matchMedia('(min-width: 1280px)'), cols: 4 },
      { mq: window.matchMedia('(min-width: 1024px)'), cols: 3 },
      { mq: window.matchMedia('(min-width: 640px)'), cols: 2 },
    ] as const;

    function update() {
      for (const { mq, cols } of queries) {
        if (mq.matches) {
          setCount(cols);
          return;
        }
      }
      setCount(1);
    }

    for (const { mq } of queries) {
      mq.addEventListener('change', update);
    }
    return () => {
      for (const { mq } of queries) {
        mq.removeEventListener('change', update);
      }
    };
  }, []);

  return count;
}

// ── Shortest-column masonry distribution ────────────────────────────────────
// Deterministic for the same input; appending items never changes existing
// column assignments because earlier decisions depend only on prior items.

function distributeToColumns<
  T extends { width?: number | null; height?: number | null },
>(items: T[], numColumns: number): T[][] {
  if (numColumns <= 1) return [items];

  const columns: T[][] = Array.from({ length: numColumns }, () => []);
  const heights: number[] = new Array(numColumns).fill(0);

  for (const item of items) {
    let minIdx = 0;
    for (let i = 1; i < numColumns; i++) {
      if (heights[i] < heights[minIdx]) minIdx = i;
    }
    columns[minIdx].push(item);
    const aspect =
      item.width && item.height ? item.height / item.width : 1;
    heights[minIdx] += Math.min(aspect, 1.5);
  }

  return columns;
}

// ── Feed page ───────────────────────────────────────────────────────────────

export function FeedPage() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useFeed();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const columnCount = useColumnCount();

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

  const photos = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

  const columns = useMemo(
    () => distributeToColumns(photos, columnCount),
    [photos, columnCount],
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg text-destructive mb-2">Failed to load feed</p>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (isLoading) {
    return <FeedSkeleton columnCount={columnCount} />;
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Camera className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <p className="text-xl font-semibold mb-2">No photos yet</p>
        <p className="text-muted-foreground mb-6">
          Be the first to share something amazing!
        </p>
        {isAuthenticated && (
          <Button asChild>
            <Link to="/upload">Upload a photo</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-4">
        {columns.map((col, colIdx) => (
          <div key={colIdx} className="flex-1 space-y-4">
            {col.map((photo) => (
              <FeedCard key={photo.id} photo={photo} />
            ))}
          </div>
        ))}
      </div>
      <div ref={sentinelRef} className="h-10" />
      {isFetchingNextPage && (
        <div className="flex flex-col items-center gap-2 py-6">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">Loading more...</span>
        </div>
      )}
    </div>
  );
}

// ── EXIF formatting helpers ─────────────────────────────────────────────────

/** Strip redundant manufacturer prefix from camera model (e.g. "Canon Canon EOS R5" → "EOS R5"). */
function shortCameraModel(exif: ExifSummary): string | null {
  if (!exif.cameraModel) return null;
  // Many cameras prefix the model with the make: "Canon Canon EOS R5"
  // or "NIKON CORPORATION NIKON Z 9" — strip the redundant part
  return exif.cameraModel
    .replace(/^(Canon|CANON|Nikon|NIKON|NIKON CORPORATION|Sony|SONY|Fujifilm|FUJIFILM|Apple|Samsung|SAMSUNG|Panasonic|PANASONIC|Olympus|OLYMPUS|OM SYSTEM|Leica|LEICA|DJI|GoPro|GOPRO|Hasselblad)\s+/i, '')
    .trim();
}

/** Format shooting settings as a compact string: "85mm · ƒ/1.4 · ISO 200" */
function formatShootingSettings(exif: ExifSummary): string | null {
  const parts: string[] = [];
  if (exif.focalLength != null) parts.push(`${Math.round(exif.focalLength)}mm`);
  if (exif.fNumber != null) parts.push(`ƒ/${exif.fNumber}`);
  if (exif.iso != null) parts.push(`ISO ${exif.iso}`);
  if (exif.exposureTime) parts.push(exif.exposureTime);
  return parts.length > 0 ? parts.join(' · ') : null;
}

// ── FeedCard ────────────────────────────────────────────────────────────────

function FeedCard({ photo }: { photo: FeedItemResponse }) {
  const aspectRatio =
    photo.width && photo.height ? photo.height / photo.width : 1;
  const paddingBottom = `${Math.min(aspectRatio * 100, 150)}%`;

  const cameraModel = photo.exifSummary ? shortCameraModel(photo.exifSummary) : null;
  const shootingSettings = photo.exifSummary ? formatShootingSettings(photo.exifSummary) : null;

  return (
    <div>
      <TransitionLink
        to="/photos/$photoId"
        params={{ photoId: photo.id }}
        className="group block overflow-hidden rounded-2xl bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      >
        <div className="relative" style={{ paddingBottom }}>
          <BlurhashImage
            blurhash={photo.blurhash}
            src={photo.thumbnails.medium ?? photo.thumbnails.small ?? ''}
            alt={photo.caption || `Photo by ${photo.author.displayName}`}
            className="absolute inset-0 h-full w-full rounded-2xl"
            style={{ viewTransitionName: `photo-${photo.id}` }}
          />
          {cameraModel && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-white text-[10px] backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="h-3 w-3" />
              <span className="truncate max-w-[120px]">{cameraModel}</span>
            </div>
          )}
          <div className="absolute bottom-2 right-2 flex items-center gap-2 rounded-full bg-black/30 px-2.5 py-1 text-white text-xs backdrop-blur-sm transition-all group-hover:bg-black/50">
            <span className={`flex items-center gap-1 ${photo.likedByMe ? 'text-red-400' : ''}`}>
              <Heart className={`h-3.5 w-3.5 ${photo.likedByMe ? 'fill-current' : ''}`} />
              {photo.likeCount}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" />
              {photo.commentCount}
            </span>
          </div>
        </div>
        <div className="border-t border-border/50 px-3 py-2.5">
          <div className="flex items-center gap-2">
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
          {shootingSettings && (
            <p className="text-[11px] text-muted-foreground mt-1 ml-8 truncate">
              {shootingSettings}
            </p>
          )}
        </div>
      </TransitionLink>
    </div>
  );
}

const SKELETON_HEIGHTS = [100, 130, 90, 120, 110, 85, 140, 95];

function FeedSkeleton({ columnCount }: { columnCount: number }) {
  const cols = useMemo(() => {
    const result: number[][] = Array.from({ length: columnCount }, () => []);
    SKELETON_HEIGHTS.forEach((_, i) => {
      result[i % columnCount].push(i);
    });
    return result;
  }, [columnCount]);

  return (
    <div className="flex gap-4">
      {cols.map((col, colIdx) => (
        <div key={colIdx} className="flex-1 space-y-4">
          {col.map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl bg-card shadow-sm">
              <Skeleton
                className="w-full"
                style={{
                  paddingBottom: `${SKELETON_HEIGHTS[i]}%`,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
              <div className="flex items-center gap-2 p-3">
                <Skeleton className="h-6 w-6 rounded-full" style={{ animationDelay: `${i * 0.1}s` }} />
                <Skeleton className="h-4 w-24" style={{ animationDelay: `${i * 0.1}s` }} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
