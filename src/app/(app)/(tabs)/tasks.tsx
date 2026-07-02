import { useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DailyLog, Goal, Timeframe } from '../../../core/domain';
import {
  addDays,
  computeRings,
  endOfWeek,
  enumerateDates,
  goalCurrent,
  goalMaxOnDate,
  goalsForScope,
  startOfWeek,
  todayISO,
} from '../../../core/logic';
import { useAuth } from '../../../features/auth/auth-provider';
import { HorizonEditor, type SavePayload } from '../../../features/goals/HorizonEditor';
import { TaskRow } from '../../../features/goals/TaskRow';
import { useSaveGoals, useUpsertLog, useWorkspace, type GoalUpdate } from '../../../features/queries';
import { Button, EmptyState, PlusIcon, ProgressRing, Skeleton, Text } from '../../../ui/components';
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

// Tasks keep equal weights; on delete re-split evenly among the remaining ones.
function equalizeTasks(siblings: Goal[]): GoalUpdate[] {
  const n = siblings.length;
  if (n === 0) return [];
  const each = Math.floor((100 / n) * 10) / 10;
  return siblings.map((x, i) => ({
    id: x.id,
    title: x.title,
    target: x.target,
    weight: i === 0 ? Math.round((100 - each * (n - 1)) * 10) / 10 : each,
    endDate: x.endDate,
  }));
}

export default function TasksScreen() {
  const c = useColors();
  const today = todayISO();
  const { user } = useAuth();
  const uid = user?.id;
  const { data: ws, isLoading, isError, refetch, isRefetching } = useWorkspace(uid);
  const upsert = useUpsertLog(uid);
  const saveGoals = useSaveGoals(uid);

  const [scope, setScope] = useState<Timeframe>('day');
  const [refDate, setRefDate] = useState<string>(today);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [editing, setEditing] = useState(false);
  const [addNew, setAddNew] = useState(false);

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

  const tasks = useMemo(() => (ws ? ws.goals.filter((g) => g.kind === 'task') : []), [ws]);
  const taskIds = useMemo(() => new Set(tasks.map((g) => g.id)), [tasks]);

  const rings = useMemo(() => computeRings(tasks, mergedLogs, refDate), [tasks, mergedLogs, refDate]);

  const weekDays = useMemo(() => enumerateDates(startOfWeek(refDate), endOfWeek(refDate)), [refDate]);
  const daysWithProgress = useMemo(() => {
    const s = new Set<string>();
    for (const l of mergedLogs) if (l.value > 0 && taskIds.has(l.goalId)) s.add(l.date);
    return s;
  }, [mergedLogs, taskIds]);

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

  const selectedTasks = goalsForScope(tasks, scope, refDate);
  // done tasks sink to the bottom
  const orderedTasks = [...selectedTasks].sort((a, b) => {
    const da = goalCurrent(a, mergedLogs, refDate) >= a.target ? 1 : 0;
    const db = goalCurrent(b, mergedLogs, refDate) >= b.target ? 1 : 0;
    return da - db;
  });
  const hasAnyTasks = tasks.length > 0;

  const doneAll = () => selectedTasks.forEach((g) => save(g.id, goalMaxOnDate(g, mergedLogs, refDate)));
  const clearAll = () => selectedTasks.forEach((g) => save(g.id, 0));

  const closeEditor = () => {
    setEditing(false);
    setAddNew(false);
  };
  const openAdd = () => {
    setAddNew(true);
    setEditing(true);
  };
  const submitHorizon = (payload: SavePayload) =>
    saveGoals.mutate(payload, { onSuccess: closeEditor });

  const deleteTask = (task: Goal) => {
    const siblings = tasks.filter((x) => x.timeframe === task.timeframe && x.id !== task.id);
    saveGoals.mutate({ updates: equalizeTasks(siblings), creates: [], deletes: [task.id] });
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing['2xl'] }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.accent} />}>
        <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: spacing.xl, gap: spacing.lg }}>
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
              <View style={{ flexDirection: 'row', gap: spacing.xs, paddingTop: spacing.md }}>
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
                      <Text variant="label" style={{ color: active ? '#fff' : isToday ? c.accent : c.text }}>
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
                  {scope === 'day' ? <View style={{ flex: 1 }} /> : <Text variant="heading">{periodTitle(scope, refDate, today)}</Text>}
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
                        closeEditor();
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
                  <Skeleton height={56} rounded={radius.lg} />
                  <Skeleton height={56} rounded={radius.lg} />
                </View>
              ) : editing ? (
                <HorizonEditor
                  scope={scope}
                  kind="task"
                  existing={selectedTasks}
                  defaultStart={refDate > today ? refDate : today}
                  addNew={addNew}
                  onSave={submitHorizon}
                  onCancel={closeEditor}
                  saving={saveGoals.isPending}
                />
              ) : (
                <>
                  {/* header + add */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: timeframeColor[scope] }} />
                    <Text variant="heading" style={{ flex: 1 }}>
                      Задачи · {timeframeLabel[scope].toLowerCase()}
                    </Text>
                    {hasAnyTasks ? (
                      <Pressable
                        onPress={openAdd}
                        hitSlop={6}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: spacing.md,
                          height: 34,
                          borderRadius: radius.md,
                          backgroundColor: c.surfaceAlt,
                          opacity: pressed ? 0.7 : 1,
                        })}>
                        <PlusIcon size={16} color={c.accent} strokeWidth={2.2} />
                        <Text variant="label" tone="accent">
                          Добавить
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {!hasAnyTasks ? (
                    <EmptyState
                      emoji="✅"
                      title="Задач пока нет"
                      subtitle="Добавь задачи на день, неделю и месяц — отмечай галочкой по мере выполнения."
                      ctaTitle="Добавить задачу"
                      onCta={openAdd}
                    />
                  ) : (
                    <View style={{ gap: spacing.md }}>
                      {orderedTasks.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          logs={mergedLogs}
                          date={refDate}
                          onToggle={save}
                          onDelete={() => deleteTask(t)}
                        />
                      ))}

                      {selectedTasks.length === 0 ? (
                        <Text variant="body" tone="muted">
                          На «{timeframeLabel[scope].toLowerCase()}» задач нет.
                        </Text>
                      ) : null}

                      {selectedTasks.length > 0 ? (
                        <View style={{ flexDirection: 'row', gap: spacing.md }}>
                          <View style={{ flex: 1 }}>
                            <Button title="Отметить всё" variant="secondary" onPress={doneAll} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Button title="Очистить" variant="ghost" onPress={clearAll} />
                          </View>
                        </View>
                      ) : null}
                    </View>
                  )}
                </>
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
