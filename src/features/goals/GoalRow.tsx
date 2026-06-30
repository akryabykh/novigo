// Goal card with inline +/- logging. The +/- (and the editable number) move the
// goal's current period total; under the hood they edit TODAY's value, so you
// can't undo past days and can't overshoot the target. Color-coded by horizon.
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, TextInput, View } from 'react-native';

import type { DailyLog, Goal, GoalSession } from '../../core/domain';
import { goalCardProgress, goalCurrent, goalMaxToday, goalToday } from '../../core/logic';
import { Card, CheckIcon, ProgressBar, Text } from '../../ui/components';
import { radius, spacing, timeframeColor, typography } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';

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
  const current = goalCurrent(session, goal, logs, today);
  const maxToday = goalMaxToday(session, goal, logs, today);
  const progress = goalCardProgress(session, goal, logs, today);
  const done = current >= goal.target;
  const others = current - todayVal; // накоплено за прошлые дни периода (нельзя убрать)

  const setTodayTo = (v: number) => {
    const clamped = Math.max(0, Math.min(v, maxToday));
    if (clamped !== todayVal && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    onSave(goal.id, clamped);
  };
  const setCurrentTo = (target: number) => setTodayTo(target - others);

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 4, backgroundColor: color }} />
        <View style={{ flex: 1, padding: spacing.lg, gap: spacing.md }}>
          {/* title + status */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
              {goal.title}
            </Text>
            {done ? (
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: color,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <CheckIcon color="#fff" size={15} strokeWidth={3} />
              </View>
            ) : null}
          </View>

          <ProgressBar progress={progress} color={color} />

          {/* stepper */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <StepBtn label="−" onPress={() => setTodayTo(todayVal - 1)} disabled={todayVal <= 0} />
            <View style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
              <TextInput
                value={String(Math.round(current * 100) / 100)}
                keyboardType="numeric"
                selectTextOnFocus
                onChangeText={(t) => {
                  const n = parseFloat(t.replace(',', '.'));
                  setCurrentTo(Number.isFinite(n) ? n : others);
                }}
                style={{
                  fontFamily: typography.bold,
                  fontSize: typography.size['2xl'],
                  color: c.text,
                  minWidth: 40,
                  textAlign: 'right',
                  padding: 0,
                }}
              />
              <Text style={{ fontFamily: typography.semibold, fontSize: typography.size.lg, color: c.textFaint }}>
                {' / '}
                {goal.target}
              </Text>
            </View>
            <StepBtn
              label="+"
              filled={color}
              onPress={() => setTodayTo(todayVal + 1)}
              disabled={todayVal >= maxToday}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

function StepBtn({
  label,
  onPress,
  disabled,
  filled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  filled?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        width: 46,
        height: 46,
        borderRadius: radius.md,
        backgroundColor: filled ?? c.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : pressed ? 0.8 : 1,
      })}>
      <Text
        style={{
          fontFamily: typography.bold,
          fontSize: 24,
          lineHeight: 28,
          color: filled ? '#fff' : c.text,
        }}>
        {label}
      </Text>
    </Pressable>
  );
}
