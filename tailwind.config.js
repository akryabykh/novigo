/**
 * Tailwind / NativeWind preset.
 *
 * The canonical design tokens live in `src/ui/theme.ts` (used by component code,
 * SVG progress rings, charts). The colors below MUST stay in sync with that file.
 * Accent = indigo. Neutrals drive light/dark surfaces.
 */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#6366F1', // indigo-500
          soft: '#EEF0FF', // tint for light surfaces
          strong: '#4F46E5', // pressed / emphasis
           on: '#FFFFFF', // text/icon on accent
        },
        // light surfaces
        bg: '#FAFAFB',
        surface: '#FFFFFF',
        border: '#ECECEF',
        text: {
          DEFAULT: '#16161D',
          muted: '#6B6B76',
          faint: '#9A9AA6',
        },
        // dark surfaces (used via dark: variant)
        'bg-dark': '#0B0B0F',
        'surface-dark': '#16161C',
        'border-dark': '#26262E',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
        '3xl': '28px',
      },
      fontFamily: {
        sans: ['Inter_400Regular', 'system-ui', 'sans-serif'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        bold: ['Inter_700Bold'],
      },
    },
  },
  plugins: [],
};
