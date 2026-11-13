import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Company } from '../types/model';

interface SessionState {
  activeCompany: Company | null;
  theme: 'light' | 'dark';
  setActiveCompany: (c: Company | null) => void;
  toggleTheme: () => void;
  setTheme: (t: 'light' | 'dark') => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      activeCompany: null,
      theme: 'light',
      setActiveCompany: (c) => set({ activeCompany: c }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setTheme: (t) => set({ theme: t }),
    }),
    { name: 'capital-session' },
  ),
);

/** Apply the theme to <html data-theme>. Call once at app root. */
export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
}
