
'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'violet-dream' | 'energetic-coral' | 'forest-mist';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme: propDefaultTheme = 'light', // Use the prop for default
  storageKey = 'morchiometro-theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedTheme = window.localStorage.getItem(storageKey) as Theme | null;
        // Ensure validThemes here matches the Theme type and NoFlashScript
        const validThemes: Theme[] = ['light', 'dark', 'violet-dream', 'energetic-coral', 'forest-mist'];
        if (storedTheme && validThemes.includes(storedTheme)) {
          return storedTheme;
        }
      } catch (e) {
        // localStorage is not available
        console.error('Error reading theme from localStorage', e);
      }
    }
    return propDefaultTheme; // Use the prop default theme here
  });

  useEffect(() => {
    const root = window.document.documentElement;
    // Ensure this list matches all possible theme class names and the Theme type
    const allThemeClasses: Theme[] = ['light', 'dark', 'violet-dream', 'energetic-coral', 'forest-mist'];
    allThemeClasses.forEach(cls => root.classList.remove(cls));
    root.classList.add(theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(storageKey, newTheme);
      } catch (e) {
        console.error('Error saving theme to localStorage', e);
      }
    }
    setThemeState(newTheme);
  }, [storageKey]);

  const value = {
    theme,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
