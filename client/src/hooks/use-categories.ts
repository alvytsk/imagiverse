import { useQuery } from '@tanstack/react-query';
import type { CategoryResponse } from 'imagiverse-shared';

import { api } from '@/lib/api-client';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () =>
      api.get<{ data: CategoryResponse[] }>('/categories', { auth: false }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (res) => res.data,
  });
}
