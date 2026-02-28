import { Link, useParams, useRouter, useRouterState } from '@tanstack/react-router';
import { TransitionLink } from '@/components/ui/transition-link';
import type { CommentResponse } from 'imagiverse-shared';
import { AlertTriangle, ChevronDown, ChevronUp, Eye, EyeOff, FolderPlus, Heart, Loader2, Lock, Maximize2, MessageCircle, Reply, SendHorizontal, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import { AddToAlbumDialog } from '@/components/albums/add-to-album-dialog';
import { ExifPanel } from '@/components/photos/exif-panel';
import { ReportDialog } from '@/components/photos/report-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useAddComment,
  useCommentReplies,
  useDeleteComment,
  useDeletePhoto,
  useLikePhoto,
  usePhoto,
  usePhotoComments,
  useUpdateVisibility,
} from '@/hooks/use-photo';
import { useUser } from '@/hooks/use-users';
import { timeAgo } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

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
  const [addToAlbumOpen, setAddToAlbumOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const lightboxTriggerRef = useRef<HTMLElement | null>(null);
  const deletePhoto = useDeletePhoto(photoId);
  const updateVisibility = useUpdateVisibility(photoId);
  const router = useRouter();

  useEffect(() => {
    if (!lightboxOpen) return;
    requestAnimationFrame(() => lightboxCloseRef.current?.focus());
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
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-6 md:grid-cols-[1fr_380px]">
        <div
          className={`overflow-hidden rounded-2xl bg-muted/20 dark:bg-black relative flex items-center justify-center md:self-start ${!isProcessing && imageSrc ? 'cursor-zoom-in group' : ''}`}
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
              className={`max-w-full object-contain max-h-[80vh] md:max-h-full rounded-2xl ${isProcessing ? 'opacity-60 blur-[2px]' : ''}`}
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

        <div className="flex flex-col md:max-h-[85vh] md:min-h-0 md:overflow-hidden">
          <div className="flex items-center gap-3 pb-4">
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
            <p className="text-sm mb-4">{photo.caption}</p>
          )}

          {photo.exifData && <ExifPanel exifData={photo.exifData} />}

          <div className="flex items-center gap-4 pb-2">
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
            <div className="flex items-center gap-1 pb-4">
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

          <Separator />

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
                      router.navigate({ to: '/' });
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
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center cursor-zoom-out"
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
            className="max-h-[95vh] max-w-[95vw] object-contain select-none"
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
    <div className="flex flex-col flex-1 pt-4 md:min-h-0">
      <div className="flex-1 space-y-3 overflow-y-auto max-h-[400px] md:max-h-full min-h-0 mb-4">
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
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-6 md:grid-cols-[1fr_380px]">
        <Skeleton className="aspect-square rounded-2xl" />
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
    </div>
  );
}
