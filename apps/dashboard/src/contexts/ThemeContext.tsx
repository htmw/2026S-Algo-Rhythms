import { createContext, useContext, type ReactNode } from 'react';
import { useTheme, type UseThemeResult } from '../hooks/useTheme.js';

const ThemeContext = createContext<UseThemeResult | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeState = useTheme();
  return (
    <ThemeContext.Provider value={themeState}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): UseThemeResult {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext must be used within ThemeProvider');
  return ctx;
}
