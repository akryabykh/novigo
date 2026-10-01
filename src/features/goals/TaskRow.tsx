// Simple Reminders-style task row: a checkbox + title. Tapping the row toggles
// done for the selected date; done tasks sink to the bottom (sorted by the screen).
// A future/inactive date is read-only (can't complete a task in the future).
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, View, type GestureResponderEvent } from 'react-native';

import type { DailyLog, Goal } from '../../core/domain';
import { Card, CheckIcon, GearIcon, Text } from '../../ui/components';
import { spacing, timeframeColor, typography } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';
import type { LogInput } from '../calendar/log-cache';
import { handleActionPress, isTaskDone, taskLogChanges } from './task-row-logic';

export function TaskRow({
  task,
  logs,
  date,
  onToggle,
  onActions,
  readOnly,
}: {
  task: Goal;
  logs: DailyLog[];
  date: string;
  onToggle: (changes: LogInput[]) => void;
  onActions?: () => void;
  /** future/inactive date — show state but don't allow toggling */
  readOnly?: boolean;
}) {
  const c = useColors();
  const color = timeframeColor[task.timeframe];
  const done = isTaskDone(task, logs, date);

  const toggle = () => {
    if (readOnly) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    onToggle(taskLogChanges(task, logs, date));
  };

  const openActions = (e: GestureResponderEvent) => handleActionPress(e, onActions);

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable onPress={toggle} disabled={readOnly}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: readOnly && !done ? 0.6 : 1 }}>
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
        </Pressable>
        {onActions ? (
          <Pressable accessibilityLabel={`Действия с задачей ${task.title}`} onPress={openActions} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
            <GearIcon size={20} color={c.textFaint} strokeWidth={1.8} />
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}
