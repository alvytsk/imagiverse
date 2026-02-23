import type {
  LoginInput,
  MeProfileResponse,
  RegisterInput,
} from 'imagiverse-shared';
import { useCallback } from 'react';
import { api, ApiClientError } from '@/lib/api-client';
import { queryClient } from '@/lib/query-client';
import { useAuthStore } from '@/stores/auth-store';

interface AuthResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user?: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    role: string;
  };
}

export function useAuth() {
  const { isAuthenticated, user, logout: storeLogout } = useAuthStore();

  const login = useCallback(async (input: LoginInput) => {
    const data = await api.post<AuthResponse>('/auth/login', input, {
      auth: false,
    });
    const me = await fetchMe(data.accessToken);
    useAuthStore.getState().setAuth(data.accessToken, me);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const data = await api.post<AuthResponse>('/auth/register', input, {
      auth: false,
    });
    const me = await fetchMe(data.accessToken);
    useAuthStore.getState().setAuth(data.accessToken, me);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore logout errors
    }
    storeLogout();
    queryClient.clear();
  }, [storeLogout]);

  const tryRefresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data: AuthResponse = await res.json();
      const me = await fetchMe(data.accessToken);
      useAuthStore.getState().setAuth(data.accessToken, me);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { isAuthenticated, user, login, register, logout, tryRefresh };
}

async function fetchMe(token: string): Promise<MeProfileResponse> {
  const res = await fetch('/api/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json();
    throw new ApiClientError(
      res.status,
      body.error?.code ?? 'FETCH_ME_FAILED',
      body.error?.message ?? 'Failed to fetch profile',
    );
  }
  return res.json();
}
