import { View } from 'react-native';

import type { DailyLog, Program, Task } from '../../core/domain';
import { daysRemaining, programProgress } from '../../core/logic';
import { Card, Chip, ProgressRing, Text } from '../../ui/components';
import { spacing } from '../../ui/theme';

const PERIOD_LABEL: Record<Program['period'], string> = {
  '7d': '7 дней',
  '14d': '14 дней',
  '30d': '30 дней',
};

function daysWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
  return 'дней';
}

export function ProgramCard({
  program,
  tasks,
  logs,
  onPress,
}: {
  program: Program;
  tasks: Task[];
  logs: DailyLog[];
  onPress: () => void;
}) {
  const progress = programProgress(program, tasks, logs);
  const left = daysRemaining(program);

  return (
    <Card onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <ProgressRing progress={progress} size={68} stroke={7} />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Text variant="heading" numberOfLines={1}>
            {program.title}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Chip label={PERIOD_LABEL[program.period]} />
            <Chip
              label={left === 0 ? 'Финальный день' : `${left} ${daysWord(left)} осталось`}
              tone={left <= 1 ? 'accent' : 'neutral'}
            />
          </View>
          <Text variant="caption" tone="faint">
            {tasks.length} {tasks.length === 1 ? 'задача' : 'задач'}
          </Text>
        </View>
      </View>
    </Card>
  );
}
