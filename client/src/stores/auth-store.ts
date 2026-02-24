import type { MeProfileResponse } from 'imagiverse-shared';
import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  user: MeProfileResponse | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  setAuth: (token: string, user: MeProfileResponse) => void;
  setToken: (token: string) => void;
  setUser: (user: MeProfileResponse) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  isInitializing: true,

  setAuth: (token, user) =>
    set({ accessToken: token, user, isAuthenticated: true }),

  setToken: (token) => set({ accessToken: token }),

  setUser: (user) => set({ user, isAuthenticated: true }),

  logout: () =>
    set({ accessToken: null, user: null, isAuthenticated: false }),
}));

/**
 * Attempt to restore the session from the refresh token cookie.
 * Runs once before React mounts to avoid StrictMode double-fire
 * issues with token rotation (the server revokes the old refresh
 * token on each /auth/refresh call, so calling it twice with the
 * same cookie destroys the session).
 */
export async function rehydrateAuth(): Promise<void> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return;

    const data = await res.json();
    const token: string = data.accessToken;

    const meRes = await fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) return;

    const me = await meRes.json();
    useAuthStore.getState().setAuth(token, me);
  } catch {
    // No valid session — user stays logged out
  } finally {
    useAuthStore.setState({ isInitializing: false });
  }
}
