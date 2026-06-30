import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DailyLog, Timeframe } from '../../../core/domain';
import {
  computeRings,
  currentWeekIndex,
  dayIndex,
  daysRemaining,
  todayISO,
} from '../../../core/logic';
import { useAuth } from '../../../features/auth/auth-provider';
import { GoalRow } from '../../../features/goals/GoalRow';
import { goalsByTimeframe } from '../../../features/goals/select';
import { useProfile, useUpsertLog, useWorkspace } from '../../../features/queries';
import { EmptyState, PlusIcon, ProgressRing, Skeleton, Text } from '../../../ui/components';
import { radius, spacing, timeframeColor, timeframeLabel } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

const ORDER: Timeframe[] = ['day', 'week', 'month'];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export default function HomeScreen() {
  const c = useColors();
  const router = useRouter();
  const today = todayISO();
  const { user } = useAuth();
  const uid = user?.id;
  const { data: profile } = useProfile(uid);
  const { data: ws, isLoading, refetch, isRefetching } = useWorkspace(uid);
  const upsert = useUpsertLog(uid);

  const [selected, setSelected] = useState<Timeframe>('day');
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // merge today's optimistic overrides over server logs
  const mergedLogs = useMemo<DailyLog[]>(() => {
    if (!ws) return [];
    const base = ws.logs.filter((l) => !(l.date === today && overrides[l.goalId] !== undefined));
    const overs = Object.entries(overrides).map(([goalId, value]) => ({ goalId, date: today, value }));
    return [...base, ...overs];
  }, [ws, overrides, today]);

  const rings = useMemo(
    () => (ws?.session ? computeRings(ws.session, ws.goals, mergedLogs, today) : null),
    [ws, mergedLogs, today],
  );

  const ringLabels = useMemo<Record<Timeframe, string>>(() => {
    if (!ws?.session) return { day: 'День', week: 'Неделя', month: 'Месяц' };
    return {
      day: `День ${dayIndex(ws.session.startDate, today) + 1}`,
      week: `Неделя ${currentWeekIndex(ws.session.startDate, today) + 1}`,
      month: 'Месяц',
    };
  }, [ws, today]);

  const save = (goalId: string, todayValue: number) => {
    setOverrides((o) => ({ ...o, [goalId]: todayValue }));
    clearTimeout(timers.current[goalId]);
    timers.current[goalId] = setTimeout(() => {
      upsert.mutate({ goalId, date: today, value: todayValue });
    }, 500);
  };

  const selectedGoals = ws ? goalsByTimeframe(ws, selected) : [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing['2xl'] }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.accent} />}>
        <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: spacing.xl, gap: spacing.lg }}>
          {/* header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: spacing.md,
            }}>
            <View>
              <Text variant="caption" tone="faint">
                {greeting()}
              </Text>
              <Text variant="title">{profile?.firstName ?? '...'}</Text>
            </View>
            <Pressable
              onPress={() => router.push('/(app)/goals/new')}
              style={{
                width: 48,
                height: 48,
                borderRadius: radius.md,
                backgroundColor: c.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <PlusIcon color={c.onAccent} />
            </Pressable>
          </View>

          {isLoading ? (
            <View style={{ gap: spacing.lg }}>
              <Skeleton height={140} rounded={radius.lg} />
              <Skeleton height={96} rounded={radius.lg} />
              <Skeleton height={96} rounded={radius.lg} />
            </View>
          ) : !ws?.session ? (
            <EmptyState
              emoji="🎯"
              title="Поставь первые цели"
              subtitle="Создай сессию целей на день, неделю и месяц — и начни двигаться. Отсчёт пойдёт с этого момента."
              ctaTitle="Создать цели"
              onCta={() => router.push('/(app)/goals/new')}
            />
          ) : (
            <>
              {/* clickable rings selector */}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {ORDER.map((tf) => {
                  const active = tf === selected;
                  const value = rings ? rings[tf] : 0;
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
                      <ProgressRing
                        progress={value}
                        size={84}
                        stroke={8}
                        color={timeframeColor[tf]}
                      />
                      <Text
                        variant="label"
                        style={{ color: active ? timeframeColor[tf] : c.textMuted }}>
                        {ringLabels[tf]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text
                variant="caption"
                tone="faint"
                style={{ textAlign: 'center' }}
                onPress={() => router.push('/(app)/goals/edit')}>
                Сессия · осталось {daysRemaining(ws.session.startDate, today)} дн. ·{' '}
                <Text variant="caption" tone="accent">
                  настроить
                </Text>
              </Text>

              {/* selected horizon goals with inline +/- */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: timeframeColor[selected],
                  }}
                />
                <Text variant="heading">Цели · {timeframeLabel[selected].toLowerCase()}</Text>
              </View>

              {selectedGoals.length === 0 ? (
                <Text variant="body" tone="muted">
                  На этот горизонт целей нет.
                </Text>
              ) : (
                <View style={{ gap: spacing.md }}>
                  {selectedGoals.map((g) => (
                    <GoalRow
                      key={g.id}
                      session={ws.session!}
                      goal={g}
                      logs={mergedLogs}
                      today={today}
                      onSave={save}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
