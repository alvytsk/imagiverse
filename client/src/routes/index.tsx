import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const FeedPage = lazy(() =>
  import('@/components/feed/feed-page').then((m) => ({ default: m.FeedPage })),
);

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    category: (search.category as string) || undefined,
  }),
  component: FeedPage,
});
