import { createFileRoute, redirect } from '@tanstack/react-router';
import { lazy } from 'react';
import { useAuthStore } from '@/stores/auth-store';

const AdminPage = lazy(() =>
  import('@/components/admin/admin-page').then((m) => ({ default: m.AdminPage })),
);

export const Route = createFileRoute('/admin')({
  beforeLoad: () => {
    const { isAuthenticated, user } = useAuthStore.getState();
    if (!isAuthenticated || user?.role !== 'admin') {
      throw redirect({ to: '/' });
    }
  },
  component: AdminPage,
});
