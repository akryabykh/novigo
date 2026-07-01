// Goal card with inline +/- logging. The stepper edits TODAY's value (you can't
// undo past days, can't overshoot the period target). Minimal, lots of air.
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, View } from 'react-native';

import type { DailyLog, Goal } from '../../core/domain';
import { goalCardProgress, goalCurrent, goalMaxOnDate, goalOnDate } from '../../core/logic';
import { Card, ProgressBar, Text } from '../../ui/components';
import { radius, spacing, timeframeColor, typography } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';

export function GoalRow({
  goal,
  logs,
  date,
  onSave,
  onEdit,
  readOnly,
}: {
  goal: Goal;
  logs: DailyLog[];
  /** the selected calendar date the stepper edits */
  date: string;
  onSave?: (goalId: string, dateValue: number) => void;
  onEdit?: () => void;
  readOnly?: boolean;
}) {
  const c = useColors();
  const color = timeframeColor[goal.timeframe];

  const todayVal = goalOnDate(goal, logs, date);
  const current = goalCurrent(goal, logs, date);
  const maxToday = goalMaxOnDate(goal, logs, date);
  const progress = goalCardProgress(goal, logs, date);
  const done = current >= goal.target;

  const setTodayTo = (v: number) => {
    const clamped = Math.max(0, Math.min(v, maxToday));
    if (clamped !== todayVal && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    onSave?.(goal.id, clamped);
  };

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
          <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>
            {goal.title}
          </Text>
          {onEdit ? (
            <Text variant="caption" tone="accent" onPress={onEdit}>
              Изм.
            </Text>
          ) : null}
        </View>

        {!readOnly ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <StepBtn label="−" onPress={() => setTodayTo(todayVal - 1)} disabled={todayVal <= 0} />
            <View style={{ flex: 1, alignItems: 'center', gap: spacing.xs }}>
              <Text style={{ fontFamily: typography.bold, fontSize: typography.size.xl, color: done ? color : c.text }}>
                {Math.round(current * 100) / 100} / {goal.target}
              </Text>
              <ProgressBar progress={progress} color={color} />
            </View>
            <StepBtn label="+" onPress={() => setTodayTo(todayVal + 1)} disabled={todayVal >= maxToday} />
          </View>
        ) : (
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontFamily: typography.bold, fontSize: typography.size.xl, color: done ? color : c.text }}>
              {Math.round(current * 100) / 100} / {goal.target}
            </Text>
            <ProgressBar progress={progress} color={color} />
          </View>
        )}
      </View>
    </Card>
  );
}

function StepBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        width: 46,
        height: 46,
        borderRadius: radius.md,
        backgroundColor: c.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}>
      <Text style={{ fontFamily: typography.bold, fontSize: 22, color: c.text }}>{label}</Text>
    </Pressable>
  );
}
