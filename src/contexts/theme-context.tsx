
'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'violet-dream' | 'energetic-coral' | 'forest-mist' | 'forest-mist-dark';
const VALID_THEMES: Readonly<Theme[]> = ['light', 'dark', 'violet-dream', 'energetic-coral', 'forest-mist', 'forest-mist-dark'];


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
  defaultTheme: propDefaultTheme = 'forest-mist',
  storageKey = 'morchiometro-theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') {
      return propDefaultTheme;
    }
    try {
      const storedTheme = window.localStorage.getItem(storageKey) as Theme | null;
      if (storedTheme && VALID_THEMES.includes(storedTheme)) {
        return storedTheme;
      }
      // No valid theme in localStorage, check OS preference
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        if (VALID_THEMES.includes('forest-mist-dark')) return 'forest-mist-dark';
      }
      // Fallback to propDefaultTheme (forest-mist) if OS prefers light or no preference
      return propDefaultTheme;
    } catch (e) {
      console.error('Error reading theme from localStorage or OS preference', e);
      return propDefaultTheme;
    }
  });

  useEffect(() => {
    const root = window.document.documentElement;
    
    VALID_THEMES.forEach(cls => {
      root.classList.remove(cls);
    });
    
    if (VALID_THEMES.includes(theme)) {
       if (!root.classList.contains(theme)) {
         root.classList.add(theme);
       }
    } else {
        // Fallback if theme state is somehow invalid
        if (!root.classList.contains(propDefaultTheme)){
             root.classList.add(propDefaultTheme);
        }
    }

  }, [theme, propDefaultTheme]);

  // Listen to OS theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      // Only update if no theme is explicitly set in localStorage
      const storedTheme = window.localStorage.getItem(storageKey) as Theme | null;
      if (!storedTheme || !VALID_THEMES.includes(storedTheme)) {
        const newOsTheme = event.matches ? 'forest-mist-dark' : 'forest-mist';
        if (VALID_THEMES.includes(newOsTheme)) {
          setThemeState(newOsTheme);
        }
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [storageKey, propDefaultTheme]);


  const setTheme = useCallback((newTheme: Theme) => {
    if (!VALID_THEMES.includes(newTheme)) {
      console.warn(`Attempted to set invalid theme: ${newTheme}`);
      return;
    }
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

