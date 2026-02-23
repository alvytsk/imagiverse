import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const UserProfilePage = lazy(() =>
  import('@/components/users/user-profile-page').then((m) => ({
    default: m.UserProfilePage,
  })),
);

export const Route = createFileRoute('/users/$userId')({
  component: UserProfilePage,
});
