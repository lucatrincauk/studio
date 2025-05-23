
'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'violet-dream' | 'energetic-coral' | 'forest-mist' | 'forest-mist-dark';
const VALID_THEMES: Readonly<Theme[]> = ['violet-dream', 'energetic-coral', 'forest-mist', 'forest-mist-dark'];
const AUTO_THEME_STORAGE_KEY = 'morchiometro-auto-theme-enabled';


interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme, isAutomaticUpdate?: boolean) => void;
  autoThemeEnabled: boolean;
  setAutoThemeEnabled: (enabled: boolean) => void;
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
  const [autoThemeEnabled, setAutoThemeEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return true; 
    }
    try {
      const storedAuto = window.localStorage.getItem(AUTO_THEME_STORAGE_KEY);
      return storedAuto !== 'false';
    } catch (e) {
      return true;
    }
  });

  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') {
      return propDefaultTheme;
    }
    try {
      const storedTheme = window.localStorage.getItem(storageKey) as Theme | null;
      if (storedTheme && VALID_THEMES.includes(storedTheme)) {
        return storedTheme;
      }
      
      const localAutoEnabled = window.localStorage.getItem(AUTO_THEME_STORAGE_KEY) !== 'false';

      if (localAutoEnabled && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        if (VALID_THEMES.includes('forest-mist-dark')) return 'forest-mist-dark';
      }
      return propDefaultTheme;
    } catch (e) {
      return propDefaultTheme;
    }
  });

  useEffect(() => {
    const root = window.document.documentElement;
    
    // Remove all known theme classes first
    const allPossibleThemes: string[] = ['light', 'dark', ...VALID_THEMES]; // Include old default light/dark to be safe
    allPossibleThemes.forEach(cls => {
      root.classList.remove(cls);
    });

    if (VALID_THEMES.includes(theme)) {
      if (!root.classList.contains(theme)) {
        root.classList.add(theme);
      }
    } else {
      // Fallback to propDefaultTheme if current theme state is somehow invalid
      if (!root.classList.contains(propDefaultTheme)) {
        root.classList.add(propDefaultTheme);
      }
    }
  }, [theme, propDefaultTheme]);

  const setTheme = useCallback((newTheme: Theme, isAutomaticUpdate = false) => {
    if (!VALID_THEMES.includes(newTheme)) {
      console.warn(`Attempted to set invalid theme: ${newTheme}`);
      return;
    }
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(storageKey, newTheme);
        if (!isAutomaticUpdate) {
          window.localStorage.setItem(AUTO_THEME_STORAGE_KEY, 'false');
          setAutoThemeEnabledState(false);
        }
      } catch (e) {
        console.error('Error saving theme to localStorage', e);
      }
    }
    setThemeState(newTheme);
  }, [storageKey]);

  const setAutoThemeEnabled = useCallback((enabled: boolean) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTO_THEME_STORAGE_KEY, String(enabled));
    }
    setAutoThemeEnabledState(enabled); 
    if (enabled) {
      let osTheme = propDefaultTheme;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        osTheme = 'forest-mist-dark';
      } else {
        osTheme = 'forest-mist'; 
      }
      if (VALID_THEMES.includes(osTheme)) {
        setTheme(osTheme, true); 
      }
    }
  }, [propDefaultTheme, setTheme]);


  useEffect(() => {
    if (typeof window === 'undefined' || !autoThemeEnabled) return; 

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      const newOsTheme = event.matches ? 'forest-mist-dark' : 'forest-mist';
      if (VALID_THEMES.includes(newOsTheme)) {
        setTheme(newOsTheme, true); 
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [autoThemeEnabled, setTheme, propDefaultTheme]);


  const value = {
    theme,
    setTheme,
    autoThemeEnabled,
    setAutoThemeEnabled,
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
