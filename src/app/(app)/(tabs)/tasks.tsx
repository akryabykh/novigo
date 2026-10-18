import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { Goal, TaskTag } from '../../../core/domain';
import {
  canLogOn,
  computeTaskRings,
  equalWeights,
  goalCurrent,
  goalsForScope,
  isPeriodEditable,
} from '../../../core/logic';
import { useAuth } from '../../../features/auth/auth-provider';
import { CalendarScaffold } from '../../../features/calendar/CalendarScaffold';
import { useCalendar } from '../../../features/calendar/useCalendar';
import { useOptimisticLog } from '../../../features/calendar/useOptimisticLog';
import { HorizonEditor, type SavePayload } from '../../../features/goals/HorizonEditor';
import { TaskActions } from '../../../features/goals/TaskActions';
import { copyTaskIntoPeriod, openTaskCounts } from '../../../features/goals/task-row-logic';
import { TaskRow } from '../../../features/goals/TaskRow';
import { filterTasksByTag, TASK_TAGS } from '../../../features/goals/task-tags';
import { useMoveTask, useSaveGoals, useSetRestDay, useWorkspace, type GoalUpdate } from '../../../features/queries';
import { Button, Card, EmptyState, PlusIcon, SegmentedControl, Skeleton, Text } from '../../../ui/components';
import { confirmAction } from '../../../ui/confirm';
import { radius, spacing, timeframeColor, timeframeLabel } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';
import { FamilyTasksScreen } from '../../../features/family/FamilyTasksScreen';

const TASK_SPACES = [{ value: 'personal', label: 'Личные' }, { value: 'family', label: 'Семья' }] as const;

export default function TasksScreen() {
  const [space, setSpace] = useState<'personal' | 'family'>('personal');
  const switcher = <SegmentedControl segments={TASK_SPACES} value={space} onChange={setSpace} />;
  return space === 'family'
    ? <FamilyTasksScreen topContent={switcher} />
    : <PersonalTasksScreen topContent={switcher} />;
}

// Tasks keep equal weights; on delete re-split evenly among the remaining ones of
// the SAME active period (item 7) — never touches tasks of another period.
function equalizeTasks(siblings: Goal[]): GoalUpdate[] {
  const w = equalWeights(siblings.length);
  return siblings.map((x, i) => ({ id: x.id, title: x.title, target: x.target, weight: w[i], endDate: x.endDate }));
}

function PersonalTasksScreen({ topContent }: { topContent: React.ReactNode }) {
  const c = useColors();
  const { user } = useAuth();
  const uid = user?.id;
  const cal = useCalendar();
  const { today, scope, refDate } = cal;

  const { data: ws, isLoading, isError, refetch, isRefetching } = useWorkspace(uid);
  const { logValues, saveError, clearSaveError } = useOptimisticLog(uid);
  const saveGoals = useSaveGoals(uid, 'task', scope, refDate);
  const copyTask = useSaveGoals(uid, 'task', scope, today);
  const moveTask = useMoveTask(uid);
  const restDay = useSetRestDay(uid);

  const [editing, setEditing] = useState(false);
  const [addNew, setAddNew] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Goal | null>(null);
  const [tagFilter, setTagFilter] = useState<TaskTag | null | 'all'>('all');

  const logs = useMemo(() => ws?.logs ?? [], [ws]);
  const tasks = useMemo(() => (ws ? ws.goals.filter((g) => g.kind === 'task') : []), [ws]);
  const taskIds = useMemo(() => new Set(tasks.map((g) => g.id)), [tasks]);

  const rings = useMemo(() => computeTaskRings(tasks, logs, refDate), [tasks, logs, refDate]);
  const emptyRings = useMemo(() => ({
    day: goalsForScope(tasks, 'day', refDate).length === 0,
    week: goalsForScope(tasks, 'week', refDate).length === 0,
    month: goalsForScope(tasks, 'month', refDate).length === 0,
  }), [tasks, refDate]);
  const pendingTaskCounts = useMemo(() => openTaskCounts(tasks, logs, refDate), [tasks, logs, refDate]);
  const daysWithProgress = useMemo(() => {
    const s = new Set<string>();
    for (const l of logs) if (l.value > 0 && taskIds.has(l.goalId)) s.add(l.date);
    return s;
  }, [logs, taskIds]);

  const selectedTasks = goalsForScope(tasks, scope, refDate);
  const isRestDay = scope === 'day' && selectedTasks.length === 0 && (ws?.restDays ?? []).includes(refDate);
  // done tasks sink to the bottom
  const orderedTasks = filterTasksByTag(selectedTasks, tagFilter).sort((a, b) => {
    const da = goalCurrent(a, logs, refDate) >= a.target ? 1 : 0;
    const db = goalCurrent(b, logs, refDate) >= b.target ? 1 : 0;
    return da - db;
  });
  const writable = (t: Goal) => canLogOn(t, refDate, today);
  const hasAnyTasks = tasks.length > 0;

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

  const closeActions = () => { setSelectedTask(null); saveGoals.reset(); copyTask.reset(); moveTask.reset(); };
  const editTask = (title: string, tag: TaskTag | null) => {
    if (!selectedTask) return;
    saveGoals.mutate({ updates: [{ id: selectedTask.id, title, target: 1, weight: selectedTask.weight,
      endDate: selectedTask.endDate, tag }], creates: [], deletes: [] }, { onSuccess: closeActions });
  };

  const deleteTask = async (task: Goal) => {
    if (!(await confirmAction(`Удалить задачу «${task.title}»?`))) return;
    // re-split weights ONLY among tasks active in the same period (item 7)
    const siblings = goalsForScope(tasks, task.timeframe, refDate).filter((x) => x.id !== task.id);
    saveGoals.mutate({ updates: equalizeTasks(siblings), creates: [], deletes: [task.id] }, { onSuccess: closeActions });
  };

  const duplicateTask = () => {
    if (!selectedTask || copyTask.isPending) return;
    copyTask.mutate(copyTaskIntoPeriod(selectedTask, tasks, today), {
      onSuccess: () => { closeActions(); cal.setRefDate(today); },
    });
  };

  return (
    <CalendarScaffold
      cal={cal}
      topContent={topContent}
      navigationDisabled={editing || !!selectedTask || saveGoals.isPending || copyTask.isPending || moveTask.isPending || restDay.isPending}
      rings={rings}
      emptyRings={emptyRings}
      pendingTaskCounts={pendingTaskCounts}
      daysWithProgress={daysWithProgress}
      restDays={new Set(ws?.restDays ?? [])}
      onSelectScope={(tf) => {
        cal.setScope(tf);
        closeEditor();
      }}
      isError={isError}
      refetch={refetch}
      isRefetching={isRefetching}
      saveError={saveGoals.isError && !editing ? saveGoals.error.message : saveError ? 'Не удалось сохранить отметку. Проверь соединение и повтори.' : null}
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
          serverError={saveGoals.error?.message ?? null}
        />
      ) : (
        <>
          {/* header + add */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: timeframeColor[scope] }} />
            <Text variant="heading" style={{ flex: 1 }}>
              Задачи · {timeframeLabel[scope].toLowerCase()}
            </Text>
            {hasAnyTasks && !isRestDay ? (
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

          {hasAnyTasks && !isRestDay ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {[{ value: 'all' as const, label: 'Все' }, ...TASK_TAGS, { value: null, label: 'Без тега' }].map((option) => {
                const active = tagFilter === option.value;
                return <Pressable key={option.label} accessibilityRole="button" accessibilityState={{ selected: active }}
                  onPress={() => setTagFilter(option.value)}
                  style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                    backgroundColor: active ? c.accentSoft : c.surfaceAlt,
                    borderWidth: 1, borderColor: active ? c.accent : c.border }}>
                  <Text variant="caption" style={{ color: active ? c.accent : c.textMuted }}>{option.label}</Text>
                </Pressable>;
              })}
            </View>
          ) : null}

          {scope === 'day' && selectedTasks.length === 0 && refDate >= today ? (
            isRestDay ? <Card style={{ gap: spacing.sm }}>
              <Text variant="heading">🌿 Выходной</Text>
              <Text variant="caption" tone="muted">День не прибавит медаль, но сохранит серию.</Text>
              <Button title="Отменить выходной" variant="secondary" size="md" loading={restDay.isPending}
                onPress={() => restDay.mutate({ day: refDate, enabled: false })} />
            </Card> : <Button title="Сделать выходным" variant="secondary" size="md"
              loading={restDay.isPending} onPress={() => restDay.mutate({ day: refDate, enabled: true })} />
          ) : isRestDay ? <Card>
            <Text variant="heading">🌿 Выходной</Text>
            <Text variant="caption" tone="muted">Этот день уже закрыт. Серия сохранена.</Text>
          </Card> : null}
          {restDay.isError ? <Text variant="caption" tone="danger">{restDay.error.message}</Text> : null}

          {isRestDay ? null : !hasAnyTasks ? (
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
                  onActions={() => { setSelectedTask(t); saveGoals.reset(); moveTask.reset(); }}
                />
              ))}

              {selectedTasks.length === 0 ? (
                <Text variant="body" tone="muted">
                  На «{timeframeLabel[scope].toLowerCase()}» задач нет.
                </Text>
              ) : orderedTasks.length === 0 ? (
                <Text variant="body" tone="muted">По выбранному тегу задач нет.</Text>
              ) : null}

            </View>
          )}
          {selectedTask ? (
            <TaskActions key={selectedTask.id} task={selectedTask} refDate={refDate}
              locked={!isPeriodEditable(selectedTask.timeframe, refDate)}
              saving={saveGoals.isPending || copyTask.isPending || moveTask.isPending}
              error={saveGoals.error?.message ?? copyTask.error?.message ?? moveTask.error?.message ?? null}
              onClose={closeActions}
              onEdit={editTask}
              onDelete={() => { void deleteTask(selectedTask); }}
              onCopy={duplicateTask}
              onMove={(input) => moveTask.mutate(input, { onSuccess: closeActions })} />
          ) : null}
        </>
      )}
    </CalendarScaffold>
  );
}
