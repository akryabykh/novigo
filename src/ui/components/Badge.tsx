// Badge — achievement medallion + small Chip for inline tags.
import { View } from 'react-native';

import { radius, spacing, typography } from '../theme';
import { useColors } from '../theme-provider';
import { Text } from './Text';

export interface BadgeProps {
  emoji: string;
  title: string;
  unlocked?: boolean;
}

export function Badge({ emoji, title, unlocked = false }: BadgeProps) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', width: 92, gap: spacing.sm }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: unlocked ? c.accentSoft : c.surfaceAlt,
          borderWidth: 1,
          borderColor: unlocked ? c.accent : c.border,
          opacity: unlocked ? 1 : 0.55,
        }}>
        <Text style={{ fontSize: 30 }}>{unlocked ? emoji : '🔒'}</Text>
      </View>
      <Text variant="caption" tone={unlocked ? 'default' : 'faint'} style={{ textAlign: 'center' }}>
        {title}
      </Text>
    </View>
  );
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' }) {
  const c = useColors();
  const accent = tone === 'accent';
  return (
    <View
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: 4,
        borderRadius: radius.full,
        backgroundColor: accent ? c.accentSoft : c.surfaceAlt,
      }}>
      <Text
        style={{
          fontFamily: typography.medium,
          fontSize: typography.size.xs,
          color: accent ? c.accent : c.textMuted,
        }}>
        {label}
      </Text>
    </View>
  );
}
