'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  resolved: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  resolved: 'dark',
  setTheme: () => {},
  toggle: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  if (theme === 'dark') {
    el.classList.add('dark');
  } else {
    el.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const choice: Theme = stored === 'light' ? 'light' : 'dark';
    setThemeState(choice);
    applyTheme(choice);
  }, []);

  const setTheme = useCallback((choice: Theme) => {
    localStorage.setItem('theme', choice);
    setThemeState(choice);
    applyTheme(choice);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved: theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
