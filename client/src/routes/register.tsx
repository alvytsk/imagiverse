import { createFileRoute, redirect } from '@tanstack/react-router';

import { RegisterPage } from '@/components/auth/register-page';
import { useAuthStore } from '@/stores/auth-store';

export const Route = createFileRoute('/register')({
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/' });
    }
  },
  component: RegisterPage,
});
