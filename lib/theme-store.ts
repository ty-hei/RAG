// lib/theme-store.ts
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { Storage } from "@plasmohq/storage"

export type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const chromeStorage = new Storage({
  area: "local"
});

const zustandChromeStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await chromeStorage.get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await chromeStorage.set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await chromeStorage.remove(name);
  }
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark', // Default to dark
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "pubmed-rag-theme-storage",
      storage: createJSONStorage(() => zustandChromeStorage),
    }
  )
);
