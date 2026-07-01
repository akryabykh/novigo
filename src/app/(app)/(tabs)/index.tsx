import { useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DailyLog, Timeframe } from '../../../core/domain';
import {
  addDays,
  computeRings,
  endOfWeek,
  enumerateDates,
  goalMaxOnDate,
  goalsForScope,
  startOfWeek,
  todayISO,
} from '../../../core/logic';
import { useAuth } from '../../../features/auth/auth-provider';
import { GoalRow } from '../../../features/goals/GoalRow';
import { HorizonEditor, type SavePayload } from '../../../features/goals/HorizonEditor';
import { useProfile, useSaveGoals, useUpsertLog, useWorkspace } from '../../../features/queries';
import { Button, EmptyState, ProgressRing, Skeleton, Text } from '../../../ui/components';
import { radius, spacing, timeframeColor, timeframeLabel } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

const ORDER: Timeframe[] = ['day', 'week', 'month'];
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

const pad = (n: number) => String(n).padStart(2, '0');
function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  const y2 = dt.getUTCFullYear();
  const m2 = dt.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
  return `${y2}-${pad(m2)}-${pad(Math.min(day, last))}`;
}
const dayNum = (d: string) => Number(d.split('-')[2]);
const monthOf = (d: string) => Number(d.split('-')[1]) - 1;

function periodTitle(scope: Timeframe, d: string, today: string): string {
  if (scope === 'day') {
    if (d === today) return 'Сегодня';
    if (d === addDays(today, -1)) return 'Вчера';
    if (d === addDays(today, 1)) return 'Завтра';
    return `${dayNum(d)} ${MONTHS_GEN[monthOf(d)]}`;
  }
  if (scope === 'week') {
    const s = startOfWeek(d);
    const e = endOfWeek(d);
    return monthOf(s) === monthOf(e)
      ? `${dayNum(s)}–${dayNum(e)} ${MONTHS_GEN[monthOf(e)]}`
      : `${dayNum(s)} ${MONTHS_GEN[monthOf(s)]} – ${dayNum(e)} ${MONTHS_GEN[monthOf(e)]}`;
  }
  const y = Number(d.split('-')[0]);
  const cy = Number(today.split('-')[0]);
  return y === cy ? MONTHS_NOM[monthOf(d)] : `${MONTHS_NOM[monthOf(d)]} ${y}`;
}

export default function HomeScreen() {
  const c = useColors();
  const today = todayISO();
  const { user } = useAuth();
  const uid = user?.id;
  const { data: profile } = useProfile(uid);
  const { data: ws, isLoading, isError, refetch, isRefetching } = useWorkspace(uid);
  const upsert = useUpsertLog(uid);
  const saveGoals = useSaveGoals(uid);

  const [scope, setScope] = useState<Timeframe>('day');
  const [refDate, setRefDate] = useState<string>(today);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [editing, setEditing] = useState(false);

  // merge optimistic per-(goal,date) overrides over server logs
  const mergedLogs = useMemo<DailyLog[]>(() => {
    if (!ws) return [];
    const ovKeys = new Set(Object.keys(overrides));
    const base = ws.logs.filter((l) => !ovKeys.has(`${l.goalId}|${l.date}`));
    const overs = Object.entries(overrides).map(([k, value]) => {
      const [goalId, date] = k.split('|');
      return { goalId, date, value };
    });
    return [...base, ...overs];
  }, [ws, overrides]);

  const rings = useMemo(
    () => (ws ? computeRings(ws.goals, mergedLogs, refDate) : { day: 0, week: 0, month: 0 }),
    [ws, mergedLogs, refDate],
  );

  const weekDays = useMemo(() => enumerateDates(startOfWeek(refDate), endOfWeek(refDate)), [refDate]);
  const daysWithProgress = useMemo(() => {
    const s = new Set<string>();
    for (const l of mergedLogs) if (l.value > 0) s.add(l.date);
    return s;
  }, [mergedLogs]);

  const stepPeriod = (dir: 1 | -1) => {
    setRefDate((d) =>
      scope === 'day' ? addDays(d, dir) : scope === 'week' ? addDays(d, dir * 7) : addMonths(d, dir),
    );
  };

  const save = (goalId: string, value: number) => {
    const key = `${goalId}|${refDate}`;
    setOverrides((o) => ({ ...o, [key]: value }));
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      upsert.mutate({ goalId, date: refDate, value });
    }, 500);
  };

  const selectedGoals = ws ? goalsForScope(ws.goals, scope, refDate) : [];
  const scopeGoals = ws ? ws.goals.filter((g) => g.timeframe === scope) : [];
  const hasAnyGoals = !!ws && ws.goals.length > 0;

  const fillAll = () => selectedGoals.forEach((g) => save(g.id, goalMaxOnDate(g, mergedLogs, refDate)));
  const clearAll = () => selectedGoals.forEach((g) => save(g.id, 0));

  const submitHorizon = (payload: SavePayload) =>
    saveGoals.mutate(payload, { onSuccess: () => setEditing(false) });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing['2xl'] }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.accent} />}>
        <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: spacing.xl, gap: spacing.lg }}>
          {/* header */}
          <View style={{ paddingTop: spacing.md }}>
            <Text variant="caption" tone="faint">
              {greeting()}
            </Text>
            <Text variant="title">{profile?.firstName ?? '...'}</Text>
          </View>

          {isError ? (
            <EmptyState
              emoji="⚠️"
              title="Не удалось загрузить"
              subtitle="Сервер не ответил вовремя. Проверь соединение и попробуй ещё раз."
              ctaTitle="Повторить"
              onCta={() => refetch()}
            />
          ) : (
            <>
              {/* day strip */}
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                {weekDays.map((d, i) => {
                  const active = d === refDate;
                  const isToday = d === today;
                  const hasProgress = daysWithProgress.has(d);
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setRefDate(d)}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        gap: 3,
                        paddingVertical: spacing.sm,
                        borderRadius: radius.md,
                        backgroundColor: active ? c.accent : 'transparent',
                        borderWidth: !active && isToday ? 1.5 : 0,
                        borderColor: c.accent,
                      }}>
                      <Text variant="caption" style={{ color: active ? '#fff' : c.textFaint }}>
                        {WD[i]}
                      </Text>
                      <Text
                        variant="label"
                        style={{ color: active ? '#fff' : isToday ? c.accent : c.text }}>
                        {dayNum(d)}
                      </Text>
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 3,
                          backgroundColor: hasProgress ? (active ? '#fff' : c.accent) : 'transparent',
                        }}
                      />
                    </Pressable>
                  );
                })}
              </View>

              {/* period navigator */}
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <NavArrow label="‹" onPress={() => stepPeriod(-1)} />
                  <Text variant="heading">{periodTitle(scope, refDate, today)}</Text>
                  <NavArrow label="›" onPress={() => stepPeriod(1)} />
                </View>
                {refDate !== today ? (
                  <Pressable
                    onPress={() => setRefDate(today)}
                    style={{
                      alignSelf: 'center',
                      paddingHorizontal: spacing.lg,
                      height: 32,
                      borderRadius: radius.md,
                      backgroundColor: c.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Text variant="label" tone="accent">
                      Сегодня
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* rings selector */}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {ORDER.map((tf) => {
                  const active = tf === scope;
                  return (
                    <Pressable
                      key={tf}
                      onPress={() => {
                        setScope(tf);
                        setEditing(false);
                      }}
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
                        {timeframeLabel[tf]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {isLoading ? (
                <View style={{ gap: spacing.md }}>
                  <Skeleton height={96} rounded={radius.lg} />
                  <Skeleton height={96} rounded={radius.lg} />
                </View>
              ) : (
                editing ? (
                  <HorizonEditor
                    scope={scope}
                    existing={scopeGoals}
                    onSave={submitHorizon}
                    onCancel={() => setEditing(false)}
                    saving={saveGoals.isPending}
                  />
                ) : (
                  <>
                    {/* goals header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: timeframeColor[scope] }} />
                      <Text variant="heading" style={{ flex: 1 }}>
                        Цели · {timeframeLabel[scope].toLowerCase()}
                      </Text>
                      {scopeGoals.length > 0 ? (
                        <Text variant="caption" tone="accent" onPress={() => setEditing(true)}>
                          Изменить
                        </Text>
                      ) : null}
                    </View>

                    {!hasAnyGoals ? (
                      <EmptyState
                        emoji="🎯"
                        title="Поставь цели"
                        subtitle="Задай цели на день, неделю и месяц — кольца начнут заполняться."
                        ctaTitle="Поставить цели"
                        onCta={() => setEditing(true)}
                      />
                    ) : (
                      <View style={{ gap: spacing.md }}>
                        {selectedGoals.map((g) => (
                          <GoalRow
                            key={g.id}
                            goal={g}
                            logs={mergedLogs}
                            date={refDate}
                            onSave={save}
                            onEdit={() => setEditing(true)}
                          />
                        ))}

                        {selectedGoals.length === 0 ? (
                          <Text variant="body" tone="muted">
                            На «{timeframeLabel[scope].toLowerCase()}» целей нет.
                          </Text>
                        ) : null}

                        <Pressable
                          onPress={() => setEditing(true)}
                          style={{
                            height: 46,
                            borderRadius: radius.md,
                            borderWidth: 1.5,
                            borderColor: c.border,
                            borderStyle: 'dashed',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                          <Text variant="label" style={{ color: timeframeColor[scope] }}>
                            Добавить цель · {timeframeLabel[scope].toLowerCase()}
                          </Text>
                        </Pressable>

                        {/* bulk actions for the selected day */}
                        {selectedGoals.length > 0 ? (
                          <View style={{ flexDirection: 'row', gap: spacing.md }}>
                            <View style={{ flex: 1 }}>
                              <Button title="Выполнить всё" variant="secondary" onPress={fillAll} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Button title="Очистить" variant="ghost" onPress={clearAll} />
                            </View>
                          </View>
                        ) : null}
                      </View>
                    )}
                  </>
                )
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function NavArrow({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.surfaceAlt,
        opacity: pressed ? 0.7 : 1,
      })}>
      <Text style={{ fontSize: 22, color: c.text }}>{label}</Text>
    </Pressable>
  );
}
