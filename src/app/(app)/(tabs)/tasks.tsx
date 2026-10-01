import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { Goal } from '../../../core/domain';
import {
  canLogOn,
  computeRings,
  equalWeights,
  goalCurrent,
  goalsForScope,
} from '../../../core/logic';
import { useAuth } from '../../../features/auth/auth-provider';
import { CalendarScaffold } from '../../../features/calendar/CalendarScaffold';
import { useCalendar } from '../../../features/calendar/useCalendar';
import { useOptimisticLog } from '../../../features/calendar/useOptimisticLog';
import { HorizonEditor, type SavePayload } from '../../../features/goals/HorizonEditor';
import { openTaskCounts, taskLogChanges } from '../../../features/goals/task-row-logic';
import { TaskRow } from '../../../features/goals/TaskRow';
import { useSaveGoals, useWorkspace, type GoalUpdate } from '../../../features/queries';
import { Button, EmptyState, PlusIcon, Skeleton, Text } from '../../../ui/components';
import { confirmAction } from '../../../ui/confirm';
import { radius, spacing, timeframeColor, timeframeLabel } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

// Tasks keep equal weights; on delete re-split evenly among the remaining ones of
// the SAME active period (item 7) — never touches tasks of another period.
function equalizeTasks(siblings: Goal[]): GoalUpdate[] {
  const w = equalWeights(siblings.length);
  return siblings.map((x, i) => ({ id: x.id, title: x.title, target: x.target, weight: w[i], endDate: x.endDate }));
}

export default function TasksScreen() {
  const c = useColors();
  const { user } = useAuth();
  const uid = user?.id;
  const cal = useCalendar();
  const { today, scope, refDate } = cal;

  const { data: ws, isLoading, isError, refetch, isRefetching } = useWorkspace(uid);
  const { logValues, saveError, clearSaveError } = useOptimisticLog(uid);
  const saveGoals = useSaveGoals(uid, 'task', scope, refDate);

  const [editing, setEditing] = useState(false);
  const [addNew, setAddNew] = useState(false);

  const logs = useMemo(() => ws?.logs ?? [], [ws]);
  const tasks = useMemo(() => (ws ? ws.goals.filter((g) => g.kind === 'task') : []), [ws]);
  const taskIds = useMemo(() => new Set(tasks.map((g) => g.id)), [tasks]);

  const rings = useMemo(() => computeRings(tasks, logs, refDate), [tasks, logs, refDate]);
  const pendingTaskCounts = useMemo(() => openTaskCounts(tasks, logs, refDate), [tasks, logs, refDate]);
  const daysWithProgress = useMemo(() => {
    const s = new Set<string>();
    for (const l of logs) if (l.value > 0 && taskIds.has(l.goalId)) s.add(l.date);
    return s;
  }, [logs, taskIds]);

  const selectedTasks = goalsForScope(tasks, scope, refDate);
  // done tasks sink to the bottom
  const orderedTasks = [...selectedTasks].sort((a, b) => {
    const da = goalCurrent(a, logs, refDate) >= a.target ? 1 : 0;
    const db = goalCurrent(b, logs, refDate) >= b.target ? 1 : 0;
    return da - db;
  });
  const writable = (t: Goal) => canLogOn(t, refDate, today);
  const writableSelected = selectedTasks.filter(writable);
  const hasAnyTasks = tasks.length > 0;

  const doneAll = () => logValues(writableSelected.flatMap((g) => taskLogChanges(g, logs, refDate, true)));
  const clearAll = () => logValues(writableSelected.flatMap((g) => taskLogChanges(g, logs, refDate, false)));

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
  const submitHorizon = (payload: SavePayload) => saveGoals.mutate(payload, { onSuccess: closeEditor });

  const deleteTask = async (task: Goal) => {
    if (!(await confirmAction(`Удалить задачу «${task.title}»?`))) return;
    // re-split weights ONLY among tasks active in the same period (item 7)
    const siblings = goalsForScope(tasks, task.timeframe, refDate).filter((x) => x.id !== task.id);
    saveGoals.mutate({ updates: equalizeTasks(siblings), creates: [], deletes: [task.id] });
  };

  return (
    <CalendarScaffold
      cal={cal}
      navigationDisabled={editing || saveGoals.isPending}
      rings={rings}
      pendingTaskCounts={pendingTaskCounts}
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
          <Skeleton height={56} rounded={radius.lg} />
          <Skeleton height={56} rounded={radius.lg} />
        </View>
      ) : editing ? (
        <HorizonEditor
          key={`${scope}:${refDate}`}
          scope={scope}
          kind="task"
          existing={selectedTasks}
          defaultStart={refDate > today ? refDate : today}
          addNew={addNew}
          onSave={submitHorizon}
          onCancel={closeEditor}
          saving={saveGoals.isPending}
          serverError={saveGoals.isError ? 'Не удалось сохранить. Проверь соединение и попробуй ещё раз.' : null}
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
                  logs={logs}
                  date={refDate}
                  readOnly={!writable(t)}
                  onToggle={logValues}
                  onDelete={() => deleteTask(t)}
                />
              ))}

              {selectedTasks.length === 0 ? (
                <Text variant="body" tone="muted">
                  На «{timeframeLabel[scope].toLowerCase()}» задач нет.
                </Text>
              ) : null}

              {writableSelected.length > 0 ? (
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
    </CalendarScaffold>
  );
}
