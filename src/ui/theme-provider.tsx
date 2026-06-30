// ============================================================
// ThemeProvider — single owner of light/dark state.
// Drives BOTH NativeWind `dark:` className variants (via nativewind's
// colorScheme API) and our JS color tokens (colorsFor). Preference is
// persisted; default is 'system'. Toggle lives in Profile.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme as nwColorScheme, useColorScheme as useNwColorScheme } from 'nativewind';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { colorsFor, type ColorScheme, type ThemeColors } from './theme';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'novigo.theme.preference';

interface ThemeContextValue {
  /** effective scheme actually rendered */
  scheme: ColorScheme;
  /** user preference (may be 'system') */
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const { colorScheme } = useNwColorScheme();

  // hydrate persisted preference once
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
        nwColorScheme.set(stored);
      }
    });
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    nwColorScheme.set(p);
    AsyncStorage.setItem(STORAGE_KEY, p);
  };

  const scheme: ColorScheme = colorScheme === 'dark' ? 'dark' : 'light';

  return (
    <ThemeContext.Provider
      value={{ scheme, preference, setPreference, colors: colorsFor(scheme) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}

/** Convenience: just the color tokens for the active scheme. */
export function useColors(): ThemeColors {
  return useTheme().colors;
}
