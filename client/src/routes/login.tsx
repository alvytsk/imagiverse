import { createFileRoute, redirect } from '@tanstack/react-router';

import { LoginPage } from '@/components/auth/login-page';
import { useAuthStore } from '@/stores/auth-store';

export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/', search: { category: undefined } });
    }
  },
  component: LoginPage,
});
