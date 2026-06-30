import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { todayISO } from '../../core/logic';
import { useAuth } from '../../features/auth/auth-provider';
import { activeSlices } from '../../features/programs/select';
import { useUpsertLog, useWorkspace } from '../../features/queries';
import {
  Card,
  CheckIcon,
  Confetti,
  EmptyState,
  ProgressBar,
  Screen,
  Skeleton,
  Stepper,
  Text,
} from '../../ui/components';
import { spacing } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export default function LogScreen() {
  const c = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const today = todayISO();
  const { data: ws, isLoading } = useWorkspace(user?.id);
  const upsert = useUpsertLog(user?.id);

  const slices = useMemo(() => (ws ? activeSlices(ws) : []), [ws]);

  // local values keyed by taskId, seeded from today's saved logs
  const [values, setValues] = useState<Record<string, number>>({});
  const seeded = useRef(false);
  useEffect(() => {
    if (!ws || seeded.current) return;
    const seed: Record<string, number> = {};
    for (const sl of slices) {
      for (const t of sl.tasks) {
        const log = sl.logs.find((l) => l.taskId === t.id && l.date === today);
        seed[t.id] = log?.value ?? 0;
      }
    }
    setValues(seed);
    seeded.current = true;
  }, [ws, slices, today]);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const save = (taskId: string, value: number) => {
    setValues((v) => ({ ...v, [taskId]: value }));
    clearTimeout(timers.current[taskId]);
    timers.current[taskId] = setTimeout(() => {
      upsert.mutate({ taskId, date: today, value });
    }, 500);
  };

  // perfect-day detection over daily tasks (local values)
  const dailyTasks = slices.flatMap((sl) => sl.tasks.filter((t) => t.goalType === 'daily'));
  const dayProgress =
    dailyTasks.length === 0
      ? 0
      : dailyTasks.reduce((s, t) => s + clamp01((values[t.id] ?? 0) / t.target), 0) /
        dailyTasks.length;

  const [confettiRun, setConfettiRun] = useState(0);
  const wasPerfect = useRef(false);
  useEffect(() => {
    const perfect = dailyTasks.length > 0 && dayProgress >= 1;
    if (perfect && !wasPerfect.current) {
      setConfettiRun((r) => r + 1);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }
    wasPerfect.current = perfect;
  }, [dayProgress, dailyTasks.length]);

  return (
    <Screen>
      <Confetti run={confettiRun} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.sm }}>
        <View>
          <Text variant="title">Сегодня</Text>
          <Text variant="caption" tone="faint">
            {today}
          </Text>
        </View>
        <Text variant="label" tone="muted" onPress={() => router.back()}>
          Готово
        </Text>
      </View>

      {isLoading ? (
        <View style={{ gap: spacing.lg }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      ) : slices.length === 0 ? (
        <EmptyState
          emoji="📝"
          title="Нет активных задач"
          subtitle="Создайте программу, чтобы отмечать ежедневный прогресс."
          ctaTitle="Создать программу"
          onCta={() => router.replace('/(app)/programs/new')}
        />
      ) : (
        <>
          {dailyTasks.length > 0 ? (
            <Card>
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="label" tone="muted">
                    Прогресс дня
                  </Text>
                  <Text variant="label" tone={dayProgress >= 1 ? 'success' : 'accent'}>
                    {Math.round(dayProgress * 100)}%
                  </Text>
                </View>
                <ProgressBar progress={dayProgress} color={dayProgress >= 1 ? c.success : c.accent} />
              </View>
            </Card>
          ) : null}

          {slices.map((sl) => (
            <View key={sl.program.id} style={{ gap: spacing.md }}>
              <Text variant="heading">{sl.program.title}</Text>
              {sl.tasks.map((t) => {
                const value = values[t.id] ?? 0;
                // overfulfillment is not allowed: daily caps at target/day,
                // period caps at the remaining amount across the whole period.
                const otherDaysSum =
                  t.goalType === 'period'
                    ? sl.logs
                        .filter((l) => l.taskId === t.id && l.date !== today)
                        .reduce((s, l) => s + l.value, 0)
                    : 0;
                const maxValue =
                  t.goalType === 'daily' ? t.target : Math.max(0, t.target - otherDaysSum);
                const done = value >= maxValue;
                return (
                  <Card key={t.id}>
                    <View style={{ gap: spacing.md }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <Text variant="label" style={{ flex: 1 }}>
                          {t.title}
                        </Text>
                        {done ? <CheckIcon color={c.success} size={20} /> : null}
                        <Text variant="caption" tone="faint">
                          цель {t.target}
                          {t.unit ? ` ${t.unit}` : ''}
                        </Text>
                      </View>
                      <Stepper
                        value={value}
                        onChange={(v) => save(t.id, Math.min(v, maxValue))}
                        unit={t.unit ?? undefined}
                        max={maxValue}
                      />
                    </View>
                  </Card>
                );
              })}
            </View>
          ))}
          <Text variant="caption" tone="faint" style={{ textAlign: 'center' }}>
            Изменения сохраняются автоматически
          </Text>
        </>
      )}
    </Screen>
  );
}
