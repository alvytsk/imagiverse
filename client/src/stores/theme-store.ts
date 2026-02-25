import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem('imagiverse-theme') as Theme) || 'system',
  setTheme: (theme) => {
    localStorage.setItem('imagiverse-theme', theme);
    applyTheme(theme);
    set({ theme });
  },
}));

export function initThemeListener() {
  // Apply the persisted theme immediately
  applyTheme(useThemeStore.getState().theme);

  // Listen for OS theme changes when in system mode
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    if (useThemeStore.getState().theme === 'system') {
      applyTheme('system');
    }
  });
}

/** Returns the resolved theme (never 'system') for components that need it */
export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useThemeStore((s) => s.theme);
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
