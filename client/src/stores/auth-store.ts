import type { MeProfileResponse } from 'imagiverse-shared';
import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  user: MeProfileResponse | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: MeProfileResponse) => void;
  setToken: (token: string) => void;
  setUser: (user: MeProfileResponse) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,

  setAuth: (token, user) =>
    set({ accessToken: token, user, isAuthenticated: true }),

  setToken: (token) => set({ accessToken: token }),

  setUser: (user) => set({ user, isAuthenticated: true }),

  logout: () =>
    set({ accessToken: null, user: null, isAuthenticated: false }),
}));
