import { createFileRoute, redirect } from '@tanstack/react-router';
import { lazy } from 'react';

import { useAuthStore } from '@/stores/auth-store';

const UploadPage = lazy(() =>
  import('@/components/upload/upload-page').then((m) => ({
    default: m.UploadPage,
  })),
);

export const Route = createFileRoute('/upload')({
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/login' });
    }
  },
  component: UploadPage,
});
