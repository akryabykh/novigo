import { View } from 'react-native';

import { levelFromXp } from '../../core/logic';
import { Card, ProgressBar, Text } from '../../ui/components';
import { spacing } from '../../ui/theme';

export function LevelBar({ xp }: { xp: number }) {
  const info = levelFromXp(xp);
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" tone="faint">
              УРОВЕНЬ
            </Text>
            <Text variant="title" tone="accent">
              {info.level}
            </Text>
          </View>
          <Text variant="label" tone="muted">
            {xp} XP
          </Text>
        </View>
        <ProgressBar progress={info.progress} height={10} />
        <Text variant="caption" tone="faint">
          {info.toNext > 0
            ? `${info.toNext - info.into} XP до уровня ${info.level + 1}`
            : 'Максимальный темп!'}
        </Text>
      </View>
    </Card>
  );
}
