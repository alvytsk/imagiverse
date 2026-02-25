import { useNavigate } from '@tanstack/react-router';
import type { NotificationResponse } from 'imagiverse-shared';
import { Heart, MessageCircle } from 'lucide-react';
import { useCallback } from 'react';

import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/utils';

interface NotificationItemProps {
  notification: NotificationResponse;
  onRead: (id: string) => void;
}

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    if (!notification.read) {
      onRead(notification.id);
    }
    navigate({
      to: '/photos/$photoId',
      params: { photoId: notification.payload.photoId },
    });
  }, [notification, onRead, navigate]);

  const isLike = notification.type === 'like';

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent',
        !notification.read && 'bg-accent/50',
      )}
    >
      <div className="mt-0.5 shrink-0">
        {isLike ? (
          <Heart className="h-4 w-4 fill-red-500 text-red-500" />
        ) : (
          <MessageCircle className="h-4 w-4 text-blue-500" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate">
          <span className="font-medium">{notification.payload.actorDisplayName}</span>{' '}
          {isLike ? 'liked your photo' : 'commented on your photo'}
        </p>
        <p className="text-xs text-muted-foreground">{timeAgo(notification.createdAt)}</p>
      </div>

      {!notification.read && (
        <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
      )}
    </button>
  );
}
