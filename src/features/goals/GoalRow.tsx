// Goal card with inline +/- logging. The stepper edits TODAY's value; the bar
// shows progress toward the goal's period target. Color-coded by horizon.
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, TextInput, View } from 'react-native';

import type { DailyLog, Goal, GoalSession } from '../../core/domain';
import { goalCardProgress, goalCurrent, goalMaxToday, goalToday } from '../../core/logic';
import { Card, ProgressBar, Text } from '../../ui/components';
import { radius, spacing, timeframeColor, typography } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';

function StepBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.md,
        backgroundColor: c.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}>
      <Text style={{ fontFamily: typography.bold, fontSize: 20, color: c.text }}>{label}</Text>
    </Pressable>
  );
}

export function GoalRow({
  session,
  goal,
  logs,
  today,
  onSave,
}: {
  session: GoalSession;
  goal: Goal;
  logs: DailyLog[];
  today: string;
  onSave: (goalId: string, todayValue: number) => void;
}) {
  const c = useColors();
  const color = timeframeColor[goal.timeframe];

  const todayVal = goalToday(goal, logs, today);
  const periodCurrent = goalCurrent(session, goal, logs, today);
  const maxToday = goalMaxToday(session, goal, logs, today);
  const progress = goalCardProgress(session, goal, logs, today);

  const setToday = (v: number) => {
    const clamped = Math.max(0, Math.min(v, maxToday));
    if (clamped !== todayVal && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    onSave(goal.id, clamped);
  };

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
          <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>
            {goal.title}
          </Text>
          <Text variant="caption" tone="faint">
            {Math.round(periodCurrent * 100) / 100} / {goal.target}
          </Text>
        </View>

        <ProgressBar progress={progress} color={color} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <StepBtn label="−" onPress={() => setToday(todayVal - 1)} disabled={todayVal <= 0} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <TextInput
                value={String(todayVal)}
                keyboardType="numeric"
                onChangeText={(t) => {
                  const n = parseFloat(t.replace(',', '.'));
                  setToday(Number.isFinite(n) ? n : 0);
                }}
                style={{
                  fontFamily: typography.bold,
                  fontSize: typography.size.xl,
                  color: c.text,
                  minWidth: 36,
                  textAlign: 'center',
                  padding: 0,
                }}
              />
            </View>
            <Text variant="caption" tone="faint">
              сегодня
            </Text>
          </View>
          <StepBtn
            label="+"
            onPress={() => setToday(todayVal + 1)}
            disabled={todayVal >= maxToday}
          />
        </View>
      </View>
    </Card>
  );
}
