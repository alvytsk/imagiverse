import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const UserProfilePage = lazy(() =>
  import('@/components/users/user-profile-page').then((m) => ({
    default: m.UserProfilePage,
  })),
);

export const Route = createFileRoute('/users/$userId')({
  validateSearch: (search: Record<string, unknown>): { tab?: 'albums' } => ({
    tab: search.tab === 'albums' ? 'albums' : undefined,
  }),
  component: UserProfilePage,
});
