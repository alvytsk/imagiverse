import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications';

import { NotificationItem } from './notification-item';

export function NotificationList() {
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useNotifications();
  const markRead = useMarkNotificationRead();

  const notifications = data?.pages.flatMap((page) => page.data) ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No notifications yet
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[400px]">
      <div className="flex flex-col">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onRead={(id) => markRead.mutate(id)}
          />
        ))}

        {hasNextPage && (
          <div className="p-2 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Load more'
              )}
            </Button>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
