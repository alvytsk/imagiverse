import { createFileRoute } from '@tanstack/react-router';

import { SearchPage } from '@/components/search/search-page';

export const Route = createFileRoute('/search')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: (search.q as string) || '',
  }),
  component: SearchPage,
});
