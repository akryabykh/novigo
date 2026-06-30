// Typed Text — enforces Inter weights + theme colors. No raw <Text> in screens.
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { typography } from '../theme';
import { useColors } from '../theme-provider';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';
type Tone = 'default' | 'muted' | 'faint' | 'accent' | 'onAccent' | 'success' | 'danger';

const VARIANTS: Record<Variant, { size: number; family: string; lineHeight: number }> = {
  display: { size: typography.size['4xl'], family: typography.bold, lineHeight: 50 },
  title: { size: typography.size['2xl'], family: typography.bold, lineHeight: 34 },
  heading: { size: typography.size.lg, family: typography.semibold, lineHeight: 24 },
  body: { size: typography.size.md, family: typography.regular, lineHeight: 23 },
  label: { size: typography.size.sm, family: typography.medium, lineHeight: 20 },
  caption: { size: typography.size.xs, family: typography.medium, lineHeight: 16 },
};

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
}

export function Text({ variant = 'body', tone = 'default', style, ...rest }: TextProps) {
  const c = useColors();
  const v = VARIANTS[variant];
  const color =
    tone === 'muted' ? c.textMuted
    : tone === 'faint' ? c.textFaint
    : tone === 'accent' ? c.accent
    : tone === 'onAccent' ? c.onAccent
    : tone === 'success' ? c.success
    : tone === 'danger' ? c.danger
    : c.text;

  return (
    <RNText
      style={[{ fontFamily: v.family, fontSize: v.size, lineHeight: v.lineHeight, color }, style]}
      {...rest}
    />
  );
}
