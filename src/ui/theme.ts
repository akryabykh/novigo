// ============================================================
// src/ui/theme.ts — CANONICAL design tokens (single source of truth).
//
// Components read from here; NativeWind utility colors in tailwind.config.js
// MUST mirror these hex values. No hardcoded colors anywhere else.
//
// Design language: minimal, lots of air, ONE accent (indigo), soft shadows,
// 16px corner radius, 8px spacing grid, Inter typography.
// ============================================================

export const palette = {
  // --- single accent: indigo ---
  accent: '#6366F1',
  accentStrong: '#4F46E5',
  accentSoft: '#EEF0FF',
  accentSoftDark: '#1E1E3A',
  onAccent: '#FFFFFF',

  // semantic
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',

  white: '#FFFFFF',
  black: '#0B0B0F',
} as const;

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
  /** track color behind progress rings/bars */
  track: string;
  shadow: string;
}

export const lightColors: ThemeColors = {
  bg: '#FAFAFB',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F4F6',
  border: '#ECECEF',
  text: '#16161D',
  textMuted: '#6B6B76',
  textFaint: '#9A9AA6',
  accent: palette.accent,
  accentStrong: palette.accentStrong,
  accentSoft: palette.accentSoft,
  onAccent: palette.onAccent,
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
  track: '#ECECEF',
  shadow: 'rgba(17, 17, 26, 0.06)',
};

export const darkColors: ThemeColors = {
  bg: '#0B0B0F',
  surface: '#16161C',
  surfaceAlt: '#1D1D24',
  border: '#26262E',
  text: '#F3F3F6',
  textMuted: '#A0A0AC',
  textFaint: '#6C6C78',
  accent: palette.accent,
  accentStrong: palette.accentStrong,
  accentSoft: palette.accentSoftDark,
  onAccent: palette.onAccent,
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
  track: '#26262E',
  shadow: 'rgba(0, 0, 0, 0.4)',
};

/** 8px spacing grid */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 16, // default card radius
  xl: 20,
  '2xl': 28,
  full: 999,
} as const;

export const typography = {
  // family keys map to loaded Inter weights
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    '2xl': 28,
    '3xl': 34,
    '4xl': 44,
  },
} as const;

export const shadow = {
  card: {
    shadowColor: '#11111A',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
} as const;

export type ColorScheme = 'light' | 'dark';

export function colorsFor(scheme: ColorScheme): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}

/** Day-active threshold for streaks (brief §12 default: daily progress >= 80%). */
export const STREAK_ACTIVE_THRESHOLD = 0.8;
