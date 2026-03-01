import { Link, useParams, useRouter, useRouterState } from '@tanstack/react-router';
import { TransitionLink } from '@/components/ui/transition-link';
import type { CommentResponse } from 'imagiverse-shared';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, EyeOff, FolderPlus, Heart, Loader2, Lock, Maximize2, MessageCircle, Reply, SendHorizontal, Tag, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import { AddToAlbumDialog } from '@/components/albums/add-to-album-dialog';
import { ExifPanel } from '@/components/photos/exif-panel';
import { ReportDialog } from '@/components/photos/report-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useCategories } from '@/hooks/use-categories';
import {
  useAddComment,
  useCommentReplies,
  useDeleteComment,
  useDeletePhoto,
  useLikePhoto,
  usePhoto,
  usePhotoComments,
  useUpdateCategory,
  useUpdateVisibility,
} from '@/hooks/use-photo';
import { useUser } from '@/hooks/use-users';
import { timeAgo } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { usePhotoNavigationStore } from '@/stores/photo-navigation-store';

export function PhotoDetailPage() {
  const { photoId } = useParams({ from: '/photos/$photoId' });
  const localPreview = useRouterState({
    select: (s) => (s.location.state as { localPreview?: string })?.localPreview,
  });
  const { data: photo, isLoading, error } = usePhoto(photoId);
  const { data: author } = useUser(photo?.userId ?? '');
  const { likeMutation, unlikeMutation, isAuthenticated } =
    useLikePhoto(photoId);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const liked = photo?.likedByMe ?? false;
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [addToAlbumOpen, setAddToAlbumOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const lightboxTriggerRef = useRef<HTMLElement | null>(null);
  const deletePhoto = useDeletePhoto(photoId);
  const updateVisibility = useUpdateVisibility(photoId);
  const updateCategory = useUpdateCategory(photoId);
  const { data: categories } = useCategories();
  const router = useRouter();

  // ── Session-stable prev/next navigation ─────────────────────────────────
  const photoIds = usePhotoNavigationStore((s) => s.photoIds);
  const sourceKey = usePhotoNavigationStore((s) => s.sourceKey);
  const feedCategory =
    sourceKey?.startsWith('feed:') && sourceKey.slice(5) !== 'all'
      ? sourceKey.slice(5)
      : undefined;
  const currentIndex = photoIds.indexOf(photoId);
  const prevId = currentIndex > 0 ? photoIds[currentIndex - 1] : null;
  const nextId = currentIndex < photoIds.length - 1 ? photoIds[currentIndex + 1] : null;

  useEffect(() => {
    if (!lightboxOpen) {
      setLightboxVisible(false);
      return;
    }
    requestAnimationFrame(() => {
      setLightboxVisible(true);
      lightboxCloseRef.current?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      lightboxTriggerRef.current?.focus();
    };
  }, [lightboxOpen]);

  // Keyboard arrow navigation between photos (skip when lightbox is open or focus is in a text field)
  useEffect(() => {
    if (!prevId && !nextId) return;
    const onKey = (e: KeyboardEvent) => {
      if (lightboxOpen) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === 'ArrowLeft' && prevId) {
        router.navigate({ to: '/photos/$photoId', params: { photoId: prevId } });
      } else if (e.key === 'ArrowRight' && nextId) {
        router.navigate({ to: '/photos/$photoId', params: { photoId: nextId } });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [prevId, nextId, lightboxOpen, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg text-destructive">Failed to load photo</p>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (isLoading || !photo) {
    return <PhotoDetailSkeleton />;
  }

  if (photo.status === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-medium">Photo processing failed</p>
        <p className="text-muted-foreground">
          Something went wrong while processing your photo. Please try uploading again.
        </p>
        <Button asChild>
          <Link to="/upload">
            <Upload className="h-4 w-4 mr-2" />
            Upload again
          </Link>
        </Button>
      </div>
    );
  }

  const isProcessing = photo.status === 'processing';
  const imageSrc = isProcessing
    ? localPreview
    : (photo.thumbnails.large ?? photo.thumbnails.medium ?? '');

  const handleLikeToggle = async () => {
    if (!isAuthenticated) {
      toast.info('Please log in to like photos');
      return;
    }
    if (liked) {
      unlikeMutation.mutate();
    } else {
      likeMutation.mutate();
    }
  };

  const displayLikes = photo.likeCount;

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumbs
        homeSearch={feedCategory ? { category: feedCategory } : undefined}
        items={[{ label: photo.caption ?? 'Photo' }]}
      />
      {/* ── Photo hero: cinema-stage presentation ── */}
      <div className="relative group/nav">
        <div
          className={`relative overflow-hidden rounded-2xl bg-muted/50 dark:bg-black flex items-center justify-center shadow-[0_4px_32px_oklch(0_0_0/0.1)] dark:shadow-[0_4px_32px_oklch(0_0_0/0.4)] ${!isProcessing && imageSrc ? 'cursor-zoom-in group' : ''}`}
          onClick={(e) => {
            if (!isProcessing && imageSrc) {
              lightboxTriggerRef.current = e.currentTarget as HTMLElement;
              setLightboxOpen(true);
            }
          }}
        >
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={photo.caption ?? 'Photo'}
              className={`w-full max-h-[76vh] object-contain ${isProcessing ? 'opacity-60 blur-[2px]' : ''}`}
              style={{ viewTransitionName: `photo-${photoId}` }}
            />
          ) : (
            <Skeleton className="aspect-[4/3] w-full" />
          )}
          {photo.visibility === 'private' && (
            <span className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <Lock className="h-3.5 w-3.5" />
              Private
            </span>
          )}
          {isProcessing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-white drop-shadow-lg" />
              <span className="text-sm font-medium text-white drop-shadow-lg">
                Processing your photo...
              </span>
            </div>
          )}
          {!isProcessing && imageSrc && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none">
              <Maximize2 className="h-10 w-10 text-white opacity-0 group-hover:opacity-60 transition-opacity drop-shadow-lg" />
            </div>
          )}
        </div>

        {/* ── Prev / Next arrows ── */}
        {prevId && (
          <button
            type="button"
            onClick={() => router.navigate({ to: '/photos/$photoId', params: { photoId: prevId } })}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center h-10 w-10 rounded-full bg-black/40 text-white backdrop-blur-sm opacity-0 group-hover/nav:opacity-100 transition-opacity hover:bg-black/60 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {nextId && (
          <button
            type="button"
            onClick={() => router.navigate({ to: '/photos/$photoId', params: { photoId: nextId } })}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center h-10 w-10 rounded-full bg-black/40 text-white backdrop-blur-sm opacity-0 group-hover/nav:opacity-100 transition-opacity hover:bg-black/60 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Next photo"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* ── Info + Comments two-column ── */}
      <div className="grid gap-8 pt-8 lg:grid-cols-[2fr_3fr]">
        {/* Left: photo metadata */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <TransitionLink to="/users/$userId" params={{ userId: photo.userId }}>
              <Avatar className="h-10 w-10" style={{ viewTransitionName: `avatar-${photo.userId}` }}>
                {author?.avatarUrl ? (
                  <AvatarImage src={author.avatarUrl} alt={author.displayName} />
                ) : null}
                <AvatarFallback className="text-sm">
                  {author?.displayName
                    ? author.displayName.charAt(0).toUpperCase()
                    : '?'}
                </AvatarFallback>
              </Avatar>
            </TransitionLink>
            <div className="min-w-0">
              <TransitionLink
                to="/users/$userId"
                params={{ userId: photo.userId }}
                className="font-medium hover:underline truncate block"
              >
                {author?.displayName ?? photo.userId}
              </TransitionLink>
              <p className="text-xs text-muted-foreground">
                {timeAgo(photo.createdAt)}
              </p>
            </div>
          </div>

          {photo.caption && (
            <p className="text-sm leading-relaxed">{photo.caption}</p>
          )}

          {photo.category && (
            <Link
              to="/"
              search={{ category: photo.category.slug }}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
            >
              <Tag className="h-3 w-3" />
              {photo.category.name}
            </Link>
          )}

          {photo.exifData && <ExifPanel exifData={photo.exifData} />}

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLikeToggle}
              disabled={isProcessing || likeMutation.isPending || unlikeMutation.isPending}
              className={liked ? 'text-red-500' : ''}
              aria-label={liked ? 'Unlike photo' : 'Like photo'}
            >
              <Heart
                className={`h-5 w-5 mr-1 transition-transform duration-200 ${liked ? 'fill-current scale-110' : ''}`}
              />
              {displayLikes}
            </Button>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <MessageCircle className="h-5 w-5" />
              {photo.commentCount}
            </span>
            {isAuthenticated && photo.userId !== currentUserId && (
              <div className="ml-auto">
                <ReportDialog photoId={photoId} />
              </div>
            )}
          </div>

          {isAuthenticated && currentUserId === photo.userId && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = photo.visibility === 'public' ? 'private' : 'public';
                  updateVisibility.mutate(next, {
                    onSuccess: () => {
                      toast.success(
                        next === 'private'
                          ? 'Photo is now private'
                          : 'Photo is now public',
                      );
                    },
                  });
                }}
                disabled={updateVisibility.isPending}
                aria-label={photo.visibility === 'public' ? 'Make private' : 'Make public'}
              >
                {photo.visibility === 'public' ? (
                  <><EyeOff className="h-4 w-4 mr-1.5" />Make private</>
                ) : (
                  <><Eye className="h-4 w-4 mr-1.5" />Make public</>
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={updateCategory.isPending}
                    aria-label="Set category"
                  >
                    <Tag className="h-4 w-4 mr-1.5" />
                    {photo.category ? photo.category.name : 'Category'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup
                    value={photo.category?.id ?? ''}
                    onValueChange={(value) => {
                      updateCategory.mutate(value === '' ? null : value, {
                        onSuccess: () => {
                          toast.success(value === '' ? 'Category removed' : 'Category updated');
                        },
                      });
                    }}
                  >
                    <DropdownMenuRadioItem value="">No category</DropdownMenuRadioItem>
                    {categories && categories.length > 0 && <DropdownMenuSeparator />}
                    {categories?.map((cat) => (
                      <DropdownMenuRadioItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddToAlbumOpen(true)}
                aria-label="Add to album"
              >
                <FolderPlus className="h-4 w-4 mr-1.5" />
                Album
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive ml-auto"
                onClick={() => setDeleteConfirmOpen(true)}
                aria-label="Delete photo"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </Button>
            </div>
          )}
        </div>

        {/* Right: discussion */}
        <div>
          <CommentsSection photoId={photoId} />
        </div>
      </div>

      {isAuthenticated && currentUserId === photo?.userId && (
        <>
          <AddToAlbumDialog
            photoId={photoId}
            userId={currentUserId}
            open={addToAlbumOpen}
            onOpenChange={setAddToAlbumOpen}
          />
          <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete photo</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this photo? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    await deletePhoto.mutateAsync();
                    setDeleteConfirmOpen(false);
                    if (window.history.length > 1) {
                      router.history.back();
                    } else {
                      router.navigate({ to: '/', search: { category: undefined } });
                    }
                  }}
                  disabled={deletePhoto.isPending}
                >
                  {deletePhoto.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {lightboxOpen && imageSrc && createPortal(
        <div
          className={`fixed inset-0 z-50 bg-black/95 flex items-center justify-center cursor-zoom-out transition-opacity duration-300 ${lightboxVisible ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Full size image"
        >
          <button
            ref={lightboxCloseRef}
            className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2.5 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(false);
            }}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={imageSrc}
            alt={photo.caption ?? 'Photo'}
            className={`max-h-[95vh] max-w-[95vw] object-contain select-none transition-all duration-300 ${lightboxVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}

function CommentsSection({ photoId }: { photoId: string }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    usePhotoComments(photoId);
  const addComment = useAddComment(photoId);
  const deleteComment = useDeleteComment(photoId);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; displayName: string } | null>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmitComment = async () => {
    const body = commentText.trim();
    if (!body) return;
    await addComment.mutateAsync({
      body,
      parentId: replyingTo?.id,
    });
    setCommentText('');
    setReplyingTo(null);
  };

  const handleReply = (comment: CommentResponse) => {
    setReplyingTo({ id: comment.id, displayName: comment.displayName });
    inputRef.current?.focus();
  };

  const comments = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && comments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No comments yet. Be the first!
          </p>
        )}

        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            currentUserId={currentUserId}
            isAuthenticated={isAuthenticated}
            onDelete={(id) => deleteComment.mutate(id)}
            onReply={handleReply}
            deleteIsPending={deleteComment.isPending}
          />
        ))}

        {hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading...' : 'Load more comments'}
          </Button>
        )}
      </div>

      {isAuthenticated ? (
        <div className="space-y-2">
          {replyingTo && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5">
              <Reply className="h-3 w-3" />
              <span>Replying to <strong>{replyingTo.displayName}</strong></span>
              <button
                onClick={() => setReplyingTo(null)}
                className="ml-auto hover:text-foreground"
                aria-label="Cancel reply"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <Textarea
              ref={inputRef}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={replyingTo ? `Reply to ${replyingTo.displayName}...` : 'Add a comment...'}
              className="min-h-[40px] resize-none rounded-2xl"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitComment();
                }
              }}
            />
            <Button
              size="icon"
              onClick={handleSubmitComment}
              disabled={!commentText.trim() || addComment.isPending}
              className="shrink-0"
              aria-label="Submit comment"
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">
          <Link to="/login" className="text-primary hover:underline">
            Log in
          </Link>{' '}
          to comment
        </p>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  currentUserId,
  isAuthenticated,
  onDelete,
  onReply,
  deleteIsPending,
}: {
  comment: CommentResponse;
  currentUserId?: string;
  isAuthenticated: boolean;
  onDelete: (id: string) => void;
  onReply: (comment: CommentResponse) => void;
  deleteIsPending: boolean;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const { data: repliesData, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useCommentReplies(comment.id);

  const handleToggleReplies = () => {
    if (!showReplies && comment.replyCount > 0) {
      refetch();
    }
    setShowReplies(!showReplies);
  };

  const replies = repliesData?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="flex gap-2 group">
      <Link to="/users/$userId" params={{ userId: comment.userId }}>
        <Avatar className="h-8 w-8">
          {comment.avatarUrl && <AvatarImage src={comment.avatarUrl} alt={comment.displayName} />}
          <AvatarFallback className="text-xs">
            {comment.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="bg-muted rounded-2xl px-3 py-2">
          <div className="flex items-center gap-2">
            <Link
              to="/users/$userId"
              params={{ userId: comment.userId }}
              className="text-sm font-medium hover:underline"
            >
              {comment.displayName}
            </Link>
            <span className="text-xs text-muted-foreground">
              {timeAgo(comment.createdAt)}
            </span>
            {currentUserId === comment.userId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                onClick={() => onDelete(comment.id)}
                disabled={deleteIsPending}
                aria-label="Delete comment"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          <p className="text-sm break-words">{comment.body}</p>
        </div>

        <div className="flex items-center gap-3 mt-1 ml-2">
          {isAuthenticated && (
            <button
              onClick={() => onReply(comment)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Reply className="h-3 w-3" />
              Reply
            </button>
          )}
          {comment.replyCount > 0 && (
            <button
              onClick={handleToggleReplies}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>

        {showReplies && (
          <div className="mt-2 ml-4 space-y-2 border-l-2 border-muted pl-3">
            {replies.map((reply) => (
              <div key={reply.id} className="flex gap-2 group/reply">
                <Link to="/users/$userId" params={{ userId: reply.userId }}>
                  <Avatar className="h-6 w-6">
                    {reply.avatarUrl && <AvatarImage src={reply.avatarUrl} alt={reply.displayName} />}
                    <AvatarFallback className="text-[10px]">
                      {reply.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="bg-muted/60 rounded-xl px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <Link
                        to="/users/$userId"
                        params={{ userId: reply.userId }}
                        className="text-xs font-medium hover:underline"
                      >
                        {reply.displayName}
                      </Link>
                      <span className="text-[10px] text-muted-foreground">
                        {timeAgo(reply.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs break-words">{reply.body}</p>
                  </div>
                </div>
              </div>
            ))}
            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="text-xs text-primary hover:underline ml-2"
              >
                {isFetchingNextPage ? 'Loading...' : 'Load more replies'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PhotoDetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex items-center gap-1">
        <Skeleton className="h-3.5 w-3.5 rounded" />
        <Skeleton className="h-3.5 w-3.5 rounded" />
        <Skeleton className="h-4 w-32 rounded" />
      </div>
      <Skeleton className="w-full rounded-2xl" style={{ paddingBottom: '52%' }} />
      <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-12 w-full rounded-2xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
