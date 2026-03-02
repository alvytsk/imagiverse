import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Camera, Heart, ImageIcon, Lock, MapPin, Pencil } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AlbumGrid } from '@/components/albums/album-grid';
import { CreateAlbumDialog } from '@/components/albums/create-album-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { BlurhashImage } from '@/components/ui/blurhash-image';
import { ImageCropDialog } from '@/components/ui/image-crop-dialog';
import { TransitionLink } from '@/components/ui/transition-link';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser, useUserPhotos, useUploadAvatar, useUploadBanner } from '@/hooks/use-users';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { usePhotoNavigationStore } from '@/stores/photo-navigation-store';

type Tab = 'photos' | 'albums';

type CropTarget = 'avatar' | 'banner' | null;

export function UserProfilePage() {
  const { userId } = useParams({ from: '/users/$userId' });
  const { data: user, isLoading, error } = useUser(userId);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isOwner = !!currentUserId && currentUserId === userId;

  const { tab } = useSearch({ from: '/users/$userId' });
  const activeTab: Tab = tab ?? 'photos';
  const navigate = useNavigate();
  const setActiveTab = (next: Tab) =>
    navigate({
      to: '/users/$userId',
      params: { userId },
      search: { tab: next === 'photos' ? undefined : next },
      replace: true,
    });
  const [createAlbumOpen, setCreateAlbumOpen] = useState(false);
  const setNavigation = usePhotoNavigationStore((s) => s.setNavigation);

  // Crop dialog state
  const [cropTarget, setCropTarget] = useState<CropTarget>(null);
  const [cropImageSrc, setCropImageSrc] = useState('');

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const uploadAvatar = useUploadAvatar(userId);
  const uploadBanner = useUploadBanner(userId);

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

  function openFilePicker(target: CropTarget) {
    if (target === 'avatar') avatarInputRef.current?.click();
    else if (target === 'banner') bannerInputRef.current?.click();
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>, target: CropTarget) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      setCropTarget(target);
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }

  function handleCropComplete(blob: Blob) {
    if (cropTarget === 'avatar') uploadAvatar.mutate(blob);
    else if (cropTarget === 'banner') uploadBanner.mutate(blob);
  }

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
      <Breadcrumbs items={[{ label: user.displayName }]} />
      {/* Hidden file inputs */}
      {isOwner && (
        <>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="hidden"
            onChange={(e) => handleFileSelected(e, 'avatar')}
          />
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="hidden"
            onChange={(e) => handleFileSelected(e, 'banner')}
          />
        </>
      )}

      {/* Crop dialog */}
      {cropImageSrc && (
        <ImageCropDialog
          open={cropTarget !== null}
          onOpenChange={(v) => { if (!v) setCropTarget(null); }}
          imageSrc={cropImageSrc}
          aspectRatio={cropTarget === 'avatar' ? 1 : 4}
          circularCrop={cropTarget === 'avatar'}
          onCropComplete={handleCropComplete}
        />
      )}

      {/* Banner */}
      <div className="relative mb-16">
        <div className="h-32 rounded-2xl overflow-hidden bg-gradient-to-r from-primary/20 via-primary/10 to-accent/20">
          {user.bannerUrl && (
            <img
              src={user.bannerUrl}
              alt="Profile banner"
              className="h-full w-full object-cover"
            />
          )}
          {isOwner && (
            <button
              onClick={() => openFilePicker('banner')}
              disabled={uploadBanner.isPending}
              className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors rounded-2xl group"
              aria-label="Change banner"
            >
              <span className="flex items-center gap-1.5 text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-lg px-3 py-1.5 backdrop-blur-sm">
                {uploadBanner.isPending ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Pencil className="h-4 w-4" />
                )}
                {uploadBanner.isPending ? 'Uploading…' : 'Change cover'}
              </span>
            </button>
          )}
        </div>

        {/* Avatar */}
        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 sm:left-8 sm:translate-x-0">
          <div className="relative group">
            <Avatar
              className="h-28 w-28 ring-4 ring-background"
              style={{ viewTransitionName: `avatar-${userId}` }}
            >
              {user.avatarUrl ? (
                <AvatarImage src={user.avatarUrl} alt={user.displayName} />
              ) : null}
              <AvatarFallback className="text-3xl">
                {user.displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {isOwner && (
              <button
                onClick={() => openFilePicker('avatar')}
                disabled={uploadAvatar.isPending}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 hover:bg-black/40 transition-colors"
                aria-label="Change avatar"
              >
                {uploadAvatar.isPending ? (
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                ) : (
                  <Camera className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
            )}
          </div>
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
                    onClick={() =>
                      setNavigation(
                        photos.map((p) => p.id),
                        `profile:${userId}`,
                        [{ label: user.displayName, to: '/users/$userId', params: { userId } }],
                      )
                    }
                  >
                    <BlurhashImage
                      blurhash={photo.blurhash}
                      src={photo.thumbnails.medium ?? photo.thumbnails.small ?? ''}
                      alt={photo.caption ?? 'Photo'}
                      className="h-full w-full rounded-xl transition-transform duration-300 group-hover:scale-105"
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
      <div className="mb-6 flex items-center gap-1">
        <Skeleton className="h-3.5 w-3.5 rounded" />
        <Skeleton className="h-3.5 w-3.5 rounded" />
        <Skeleton className="h-4 w-24 rounded" />
      </div>
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
