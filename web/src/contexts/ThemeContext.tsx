'use client';

import { createContext, useContext } from 'react';

type Theme = 'dark';

interface ThemeContextValue {
  theme: Theme;
  resolved: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const VALUE: ThemeContextValue = {
  theme: 'dark',
  resolved: 'dark',
  setTheme: () => {},
  toggle: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(VALUE);

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeContext.Provider value={VALUE}>{children}</ThemeContext.Provider>;
}
