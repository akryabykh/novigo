// Admin / preview mode: a demo session with "perfect performance" logs and a
// bottom day-scrubber, so you can see how the rings fill on day 1, 15, 28.
// Local only — no Supabase. Reached via login admin / 1111.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DailyLog, Goal, GoalSession, Timeframe } from '../../core/domain';
import {
  SESSION_DAYS,
  addDays,
  computeRings,
  currentWeekIndex,
  enumerateDates,
  todayISO,
} from '../../core/logic';
import { useAuth } from '../../features/auth/auth-provider';
import { GoalRow } from '../../features/goals/GoalRow';
import { ProgressRing, Text } from '../../ui/components';
import { radius, spacing, timeframeColor } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';

const START = todayISO();
const SESSION: GoalSession = { id: 'demo', userId: 'demo', startDate: START };
const DEMO_GOALS: Goal[] = [
  { id: 'd1', sessionId: 'demo', title: 'Зарядка', timeframe: 'day', target: 1, weight: 50 },
  { id: 'd2', sessionId: 'demo', title: 'Чтение, страниц', timeframe: 'day', target: 20, weight: 50 },
  { id: 'w1', sessionId: 'demo', title: 'Пробежки', timeframe: 'week', target: 3, weight: 100 },
  { id: 'm1', sessionId: 'demo', title: 'Прочитать книгу', timeframe: 'month', target: 1, weight: 100 },
];

const ORDER: Timeframe[] = ['day', 'week', 'month'];
const JUMPS = [1, 7, 14, 21, 28];

/** Perfect-performance logs up to the simulated day. */
function genLogs(simToday: string): DailyLog[] {
  const logs: DailyLog[] = [];
  for (const g of DEMO_GOALS) {
    const per = g.timeframe === 'day' ? g.target : g.timeframe === 'week' ? g.target / 7 : g.target / SESSION_DAYS;
    for (const d of enumerateDates(START, simToday)) logs.push({ goalId: g.id, date: d, value: per });
  }
  return logs;
}

export default function AdminScreen() {
  const c = useColors();
  const { exitAdmin } = useAuth();

  const [simDay, setSimDay] = useState(1); // 1..28
  const [selected, setSelected] = useState<Timeframe>('day');

  const simToday = addDays(START, simDay - 1);
  const logs = useMemo(() => genLogs(simToday), [simToday]);
  const rings = useMemo(() => computeRings(SESSION, DEMO_GOALS, logs, simToday), [logs, simToday]);
  const weekNum = currentWeekIndex(START, simToday) + 1;
  const ringLabels: Record<Timeframe, string> = {
    day: `День ${simDay}`,
    week: `Неделя ${weekNum}`,
    month: 'Месяц',
  };

  const goals = DEMO_GOALS.filter((g) => g.timeframe === selected);
  const setDay = (d: number) => setSimDay(Math.max(1, Math.min(SESSION_DAYS, d)));

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
        }}>
        <View>
          <Text variant="caption" tone="faint">
            Режим предпросмотра
          </Text>
          <Text variant="title">Админ · демо</Text>
        </View>
        <Text variant="label" tone="accent" onPress={() => exitAdmin()}>
          Выйти
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing['2xl'] }}
        showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: spacing.xl, gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {ORDER.map((tf) => {
              const active = tf === selected;
              return (
                <Pressable
                  key={tf}
                  onPress={() => setSelected(tf)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    gap: spacing.sm,
                    paddingVertical: spacing.md,
                    borderRadius: radius.lg,
                    borderWidth: 1.5,
                    borderColor: active ? timeframeColor[tf] : c.border,
                    backgroundColor: active ? c.surface : 'transparent',
                  }}>
                  <ProgressRing progress={rings[tf]} size={84} stroke={8} color={timeframeColor[tf]} />
                  <Text variant="label" style={{ color: active ? timeframeColor[tf] : c.textMuted }}>
                    {ringLabels[tf]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text variant="caption" tone="faint" style={{ textAlign: 'center' }}>
            Демо «идеального» выполнения. Листай дни внизу, чтобы увидеть, как наполняются кольца.
          </Text>

          <View style={{ gap: spacing.md }}>
            {goals.map((g) => (
              <GoalRow key={g.id} session={SESSION} goal={g} logs={logs} today={simToday} readOnly />
            ))}
          </View>
        </View>
      </ScrollView>

      {/* day scrubber */}
      <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface, padding: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <ScrubBtn label="−" onPress={() => setDay(simDay - 1)} />
          <View style={{ alignItems: 'center' }}>
            <Text variant="heading">День {simDay}</Text>
            <Text variant="caption" tone="faint">
              из {SESSION_DAYS}
            </Text>
          </View>
          <ScrubBtn label="+" onPress={() => setDay(simDay + 1)} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
          {JUMPS.map((d) => {
            const active = d === simDay;
            return (
              <Pressable
                key={d}
                onPress={() => setDay(d)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.full,
                  backgroundColor: active ? c.accent : c.surfaceAlt,
                }}>
                <Text variant="label" style={{ color: active ? c.onAccent : c.textMuted }}>
                  {d}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

function ScrubBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 54,
        height: 54,
        borderRadius: radius.md,
        backgroundColor: c.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}>
      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 26, color: c.text }}>{label}</Text>
    </Pressable>
  );
}
