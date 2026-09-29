import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { Goal } from '../../../core/domain';
import {
  canLogOn,
  computeRings,
  goalCurrent,
  goalMaxOnDate,
  goalsForScope,
  redistributeWeights,
} from '../../../core/logic';
import { useAuth } from '../../../features/auth/auth-provider';
import { CalendarScaffold } from '../../../features/calendar/CalendarScaffold';
import { useCalendar } from '../../../features/calendar/useCalendar';
import { useOptimisticLog } from '../../../features/calendar/useOptimisticLog';
import { GoalRow } from '../../../features/goals/GoalRow';
import { HorizonEditor, type SavePayload } from '../../../features/goals/HorizonEditor';
import { useSaveGoals, useWorkspace, type GoalUpdate } from '../../../features/queries';
import { Button, EmptyState, GearIcon, PlusIcon, Skeleton, Text } from '../../../ui/components';
import { confirmAction } from '../../../ui/confirm';
import { radius, spacing, timeframeColor, timeframeLabel } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

// Redistribute a deleted goal's weight among its siblings, ALL within the same
// active period (see item 7) — never touches goals of other periods.
function redistribute(siblings: Goal[], freed: number): GoalUpdate[] {
  const weights = redistributeWeights(siblings.map((s) => s.weight), freed);
  return siblings.map((s, i) => ({ id: s.id, title: s.title, target: s.target, weight: weights[i], endDate: s.endDate }));
}

export default function HomeScreen() {
  const c = useColors();
  const { user } = useAuth();
  const uid = user?.id;
  const cal = useCalendar();
  const { today, scope, refDate } = cal;

  const { data: ws, isLoading, isError, refetch, isRefetching } = useWorkspace(uid);
  const { logValue, saveError, clearSaveError } = useOptimisticLog(uid);
  const saveGoals = useSaveGoals(uid);

  const [editing, setEditing] = useState(false);
  const [addNew, setAddNew] = useState(false);

  const logs = useMemo(() => ws?.logs ?? [], [ws]);
  // this screen shows only real goals (kind === 'goal'); tasks live on the Tasks tab
  const goals = useMemo(() => (ws ? ws.goals.filter((g) => g.kind !== 'task') : []), [ws]);
  const goalIds = useMemo(() => new Set(goals.map((g) => g.id)), [goals]);

  const rings = useMemo(() => computeRings(goals, logs, refDate), [goals, logs, refDate]);
  const daysWithProgress = useMemo(() => {
    const s = new Set<string>();
    for (const l of logs) if (l.value > 0 && goalIds.has(l.goalId)) s.add(l.date);
    return s;
  }, [logs, goalIds]);

  const selectedGoals = goalsForScope(goals, scope, refDate);
  // completed goals sink to the bottom (stable within groups)
  const orderedGoals = [...selectedGoals].sort((a, b) => {
    const da = goalCurrent(a, logs, refDate) >= a.target ? 1 : 0;
    const db = goalCurrent(b, logs, refDate) >= b.target ? 1 : 0;
    return da - db;
  });
  const writable = (g: Goal) => canLogOn(g, refDate, today);
  const writableSelected = selectedGoals.filter(writable);
  const hasAnyGoals = goals.length > 0;

  // bulk actions only touch goals that are writable on this date (item 2)
  const fillAll = () => writableSelected.forEach((g) => logValue(g.id, refDate, goalMaxOnDate(g, logs, refDate)));
  const clearAll = () => writableSelected.forEach((g) => logValue(g.id, refDate, 0));

  const closeEditor = () => {
    setEditing(false);
    setAddNew(false);
  };
  const openAdd = () => {
    if (saveGoals.isPending) return;
    saveGoals.reset();
    setAddNew(true);
    setEditing(true);
  };
  const openEdit = () => {
    if (saveGoals.isPending) return;
    saveGoals.reset();
    setAddNew(false);
    setEditing(true);
  };
  const submitHorizon = (payload: SavePayload) => saveGoals.mutate(payload, { onSuccess: closeEditor });

  const deleteGoal = async (goal: Goal) => {
    if (!(await confirmAction(`Удалить цель «${goal.title}»?`))) return;
    // redistribute weight ONLY among goals active in the same period (item 7)
    const siblings = goalsForScope(goals, goal.timeframe, refDate).filter((x) => x.id !== goal.id);
    saveGoals.mutate({ updates: redistribute(siblings, goal.weight), creates: [], deletes: [goal.id] });
  };

  return (
    <CalendarScaffold
      cal={cal}
      navigationDisabled={editing || saveGoals.isPending}
      rings={rings}
      daysWithProgress={daysWithProgress}
      onSelectScope={(tf) => {
        cal.setScope(tf);
        closeEditor();
      }}
      isError={isError}
      refetch={refetch}
      isRefetching={isRefetching}
      saveError={saveGoals.isError && !editing ? 'Не удалось сохранить изменения. Проверь соединение и повтори.' : saveError ? 'Не удалось сохранить отметку. Проверь соединение и повтори.' : null}
      onDismissError={() => { clearSaveError(); saveGoals.reset(); }}>
      {isLoading ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={96} rounded={radius.lg} />
          <Skeleton height={96} rounded={radius.lg} />
        </View>
      ) : editing ? (
        <HorizonEditor
          key={`${scope}:${refDate}`}
          scope={scope}
          existing={selectedGoals}
          defaultStart={refDate > today ? refDate : today}
          addNew={addNew}
          onSave={submitHorizon}
          onCancel={closeEditor}
          saving={saveGoals.isPending}
          serverError={saveGoals.isError ? 'Не удалось сохранить. Проверь соединение и попробуй ещё раз.' : null}
        />
      ) : (
        <>
          {/* goals header + gear + add */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: timeframeColor[scope] }} />
            <Text variant="heading" style={{ flex: 1 }}>
              Цели · {timeframeLabel[scope].toLowerCase()}
            </Text>
            {hasAnyGoals ? (
              <>
                <Pressable
                  onPress={openEdit}
                  hitSlop={6}
                  style={({ pressed }) => ({
                    width: 34,
                    height: 34,
                    borderRadius: radius.md,
                    backgroundColor: c.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}>
                  <GearIcon size={18} color={c.textMuted} strokeWidth={1.9} />
                </Pressable>
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
              </>
            ) : null}
          </View>

          {!hasAnyGoals ? (
            <EmptyState
              emoji="🎯"
              title="Поставь цели"
              subtitle="Задай цели на день, неделю и месяц — кольца начнут заполняться."
              ctaTitle="Поставить цели"
              onCta={openAdd}
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              {orderedGoals.map((g) => (
                <GoalRow
                  key={g.id}
                  goal={g}
                  logs={logs}
                  date={refDate}
                  readOnly={!writable(g)}
                  onSave={writable(g) ? (id, v) => logValue(id, refDate, v) : undefined}
                  onDelete={() => deleteGoal(g)}
                />
              ))}

              {selectedGoals.length === 0 ? (
                <Text variant="body" tone="muted">
                  На «{timeframeLabel[scope].toLowerCase()}» целей нет.
                </Text>
              ) : null}

              {/* bulk actions for the selected day (writable goals only) */}
              {writableSelected.length > 0 ? (
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
      )}
    </CalendarScaffold>
  );
}
