
'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'violet-dream' | 'energetic-coral' | 'forest-mist' | 'forest-mist-dark';

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
  defaultTheme: propDefaultTheme = 'forest-mist', // Default matches SERVER_DEFAULT_THEME in layout
  storageKey = 'morchiometro-theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedTheme = window.localStorage.getItem(storageKey) as Theme | null;
        const validThemes: Theme[] = ['light', 'dark', 'violet-dream', 'energetic-coral', 'forest-mist', 'forest-mist-dark'];
        if (storedTheme && validThemes.includes(storedTheme)) {
          return storedTheme;
        }
      } catch (e) {
        console.error('Error reading theme from localStorage', e);
      }
    }
    return propDefaultTheme;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    const allThemeClasses: Theme[] = ['light', 'dark', 'violet-dream', 'energetic-coral', 'forest-mist', 'forest-mist-dark'];
    
    // Remove all known theme classes first to ensure a clean state
    allThemeClasses.forEach(cls => {
      root.classList.remove(cls);
    });
    // Add the current theme from state
    if (!root.classList.contains(theme)) {
      root.classList.add(theme);
    }
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
