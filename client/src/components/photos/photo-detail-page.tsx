import { Link, useParams, useRouterState } from '@tanstack/react-router';
import { AlertTriangle, Heart, Loader2, MessageCircle, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useAddComment,
  useDeleteComment,
  useLikePhoto,
  usePhoto,
  usePhotoComments,
} from '@/hooks/use-photo';
import { useAuthStore } from '@/stores/auth-store';

export function PhotoDetailPage() {
  const { photoId } = useParams({ from: '/photos/$photoId' });
  const localPreview = useRouterState({
    select: (s) => (s.location.state as { localPreview?: string })?.localPreview,
  });
  const { data: photo, isLoading, error } = usePhoto(photoId);
  const { likeMutation, unlikeMutation, isAuthenticated } =
    useLikePhoto(photoId);
  const [liked, setLiked] = useState(false);

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
      setLiked(false);
      unlikeMutation.mutate();
    } else {
      setLiked(true);
      likeMutation.mutate();
    }
  };

  const displayLikes = photo.likeCount;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-6 md:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-lg border bg-black relative">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={photo.caption ?? 'Photo'}
              className={`w-full object-contain max-h-[80vh] ${isProcessing ? 'opacity-60 blur-[2px]' : ''}`}
            />
          ) : (
            <Skeleton className="aspect-[4/3] w-full" />
          )}
          {isProcessing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-white drop-shadow-lg" />
              <span className="text-sm font-medium text-white drop-shadow-lg">
                Processing your photo...
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-3 pb-4">
            <Link to="/users/$userId" params={{ userId: photo.userId }}>
              <Avatar className="h-10 w-10">
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
            </Link>
            <div>
              <Link
                to="/users/$userId"
                params={{ userId: photo.userId }}
                className="font-medium hover:underline"
              >
                {photo.userId}
              </Link>
              <p className="text-xs text-muted-foreground">
                {new Date(photo.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {photo.caption && (
            <p className="text-sm mb-4">{photo.caption}</p>
          )}

          <div className="flex items-center gap-4 pb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLikeToggle}
              disabled={isProcessing || likeMutation.isPending || unlikeMutation.isPending}
              className={liked ? 'text-red-500' : ''}
            >
              <Heart
                className={`h-5 w-5 mr-1 ${liked ? 'fill-current' : ''}`}
              />
              {displayLikes}
            </Button>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <MessageCircle className="h-5 w-5" />
              {photo.commentCount}
            </span>
          </div>

          <Separator />

          <CommentsSection photoId={photoId} />
        </div>
      </div>
    </div>
  );
}

function CommentsSection({ photoId }: { photoId: string }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    usePhotoComments(photoId);
  const addComment = useAddComment(photoId);
  const deleteComment = useDeleteComment(photoId);
  const [commentText, setCommentText] = useState('');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const handleSubmitComment = async () => {
    const body = commentText.trim();
    if (!body) return;
    await addComment.mutateAsync({ body });
    setCommentText('');
  };

  const comments = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="flex flex-col flex-1 pt-4">
      <div className="flex-1 space-y-4 overflow-y-auto max-h-[400px] mb-4">
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
          <div key={comment.id} className="flex gap-2 group">
            <Link to="/users/$userId" params={{ userId: comment.userId }}>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  {comment.displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  to="/users/$userId"
                  params={{ userId: comment.userId }}
                  className="text-sm font-medium hover:underline"
                >
                  {comment.displayName}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </span>
                {currentUserId === comment.userId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => deleteComment.mutate(comment.id)}
                    disabled={deleteComment.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <p className="text-sm break-words">{comment.body}</p>
            </div>
          </div>
        ))}

        {hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            isLoading={isFetchingNextPage}
          >
            Load more comments
          </Button>
        )}
      </div>

      {isAuthenticated ? (
        <div className="flex gap-2">
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            className="min-h-[40px] resize-none"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmitComment();
              }
            }}
          />
          <Button
            size="sm"
            onClick={handleSubmitComment}
            disabled={!commentText.trim() || addComment.isPending}
            isLoading={addComment.isPending}
          >
            Post
          </Button>
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

function PhotoDetailSkeleton() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-6 md:grid-cols-[1fr_380px]">
        <Skeleton className="aspect-square rounded-lg" />
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
