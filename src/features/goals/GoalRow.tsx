// Goal card with inline +/- logging. The stepper edits TODAY's value (you can't
// undo past days, can't overshoot the period target). Minimal, lots of air.
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, TextInput, View } from 'react-native';

import type { DailyLog, Goal, GoalSession } from '../../core/domain';
import { goalCardProgress, goalCurrent, goalMaxToday, goalToday } from '../../core/logic';
import { Card, ProgressBar, Text } from '../../ui/components';
import { radius, spacing, timeframeColor, typography } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';

export function GoalRow({
  session,
  goal,
  logs,
  today,
  onSave,
  readOnly,
}: {
  session: GoalSession;
  goal: Goal;
  logs: DailyLog[];
  today: string;
  onSave?: (goalId: string, todayValue: number) => void;
  readOnly?: boolean;
}) {
  const c = useColors();
  const color = timeframeColor[goal.timeframe];

  const todayVal = goalToday(goal, logs, today);
  const current = goalCurrent(session, goal, logs, today);
  const maxToday = goalMaxToday(session, goal, logs, today);
  const progress = goalCardProgress(session, goal, logs, today);
  const done = current >= goal.target;

  const setTodayTo = (v: number) => {
    const clamped = Math.max(0, Math.min(v, maxToday));
    if (clamped !== todayVal && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    onSave?.(goal.id, clamped);
  };

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
          <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>
            {goal.title}
          </Text>
          <Text variant="caption" style={{ color: done ? color : c.textFaint }}>
            {Math.round(current * 100) / 100} / {goal.target}
          </Text>
        </View>

        <ProgressBar progress={progress} color={color} />

        {!readOnly ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <StepBtn label="−" onPress={() => setTodayTo(todayVal - 1)} disabled={todayVal <= 0} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <TextInput
                value={String(todayVal)}
                keyboardType="numeric"
                selectTextOnFocus
                onChangeText={(t) => {
                  const n = parseFloat(t.replace(',', '.'));
                  setTodayTo(Number.isFinite(n) ? n : 0);
                }}
                style={{
                  fontFamily: typography.bold,
                  fontSize: typography.size['2xl'],
                  color: c.text,
                  minWidth: 40,
                  textAlign: 'center',
                  padding: 0,
                }}
              />
              <Text variant="caption" tone="faint">
                сегодня
              </Text>
            </View>
            <StepBtn label="+" onPress={() => setTodayTo(todayVal + 1)} disabled={todayVal >= maxToday} />
          </View>
        ) : null}
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
