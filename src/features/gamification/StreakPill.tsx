import { View } from 'react-native';

import { Card, FlameIcon, Text } from '../../ui/components';
import { palette, spacing } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';

function streakWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'дня';
  return 'дней';
}

export function StreakPill({ current, best }: { current: number; best: number }) {
  const c = useColors();
  const active = current > 0;
  return (
    <Card style={{ flex: 1 }}>
      <View style={{ gap: spacing.sm }}>
        <FlameIcon color={active ? palette.warning : c.textFaint} size={26} />
        <Text variant="title">{current}</Text>
        <Text variant="caption" tone="muted">
          {streakWord(current)} подряд
        </Text>
        <Text variant="caption" tone="faint">
          Рекорд: {best}
        </Text>
      </View>
    </Card>
  );
}
