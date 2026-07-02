// Simple Reminders-style task row: a checkbox + title. Tapping the row toggles
// done for the selected date; done tasks sink to the bottom (sorted by the screen).
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, View } from 'react-native';

import type { DailyLog, Goal } from '../../core/domain';
import { goalCurrent, goalMaxOnDate, goalOnDate } from '../../core/logic';
import { Card, CheckIcon, Text, TrashIcon } from '../../ui/components';
import { spacing, timeframeColor, typography } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';

export function TaskRow({
  task,
  logs,
  date,
  onToggle,
  onDelete,
}: {
  task: Goal;
  logs: DailyLog[];
  date: string;
  onToggle: (taskId: string, value: number) => void;
  onDelete?: () => void;
}) {
  const c = useColors();
  const color = timeframeColor[task.timeframe];
  const done = goalCurrent(task, logs, date) >= task.target;

  const toggle = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    // check → log the remainder on this date; uncheck → clear this date's value
    onToggle(task.id, done ? 0 : goalOnDate(task, logs, date) + goalMaxOnDate(task, logs, date));
  };

  return (
    <Card>
      <Pressable
        onPress={toggle}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: done ? 0 : 2,
            borderColor: c.border,
            backgroundColor: done ? color : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {done ? <CheckIcon size={16} color="#fff" strokeWidth={3} /> : null}
        </View>
        <Text
          variant="label"
          style={{
            flex: 1,
            color: done ? c.textFaint : c.text,
            textDecorationLine: done ? 'line-through' : 'none',
            fontFamily: typography.regular,
          }}
          numberOfLines={2}>
          {task.title}
        </Text>
        {onDelete ? (
          <Pressable onPress={onDelete} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
            <TrashIcon size={18} color={c.textFaint} strokeWidth={1.8} />
          </Pressable>
        ) : null}
      </Pressable>
    </Card>
  );
}
