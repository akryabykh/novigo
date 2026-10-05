import { describe, expect, jest, test } from '@jest/globals';
import { copyTaskIntoPeriod, handleActionPress, isTaskDone, openTaskCounts, taskLogChanges, taskToggleValue } from '../features/goals/task-row-logic';
import { log, mkGoal } from './fixtures';
import { applyLog } from '../features/calendar/log-cache';

const task = mkGoal({ id: 't', kind: 'task', timeframe: 'day', target: 1 });

describe('unfinished task counts', () => {
  test('includes zero and counts beyond nine without capping', () => {
    const weeklyTasks = Array.from({ length: 12 }, (_, i) => mkGoal({ id: `w${i}`, kind: 'task', timeframe: 'week' }));
    expect(openTaskCounts(weeklyTasks, [], '2024-06-12')).toEqual({ day: 0, week: 12, month: 0 });
  });

  test('follows the selected period and excludes completed tasks', () => {
    const daily = mkGoal({ id: 'd', kind: 'task', timeframe: 'day' });
    const weekly = mkGoal({ id: 'w', kind: 'task', timeframe: 'week' });
    const monthly = mkGoal({ id: 'm', kind: 'task', timeframe: 'month' });
    const tasks = [daily, weekly, monthly];
    const logs = [log('d', '2024-06-12', 1), log('w', '2024-06-10', 1), log('m', '2024-06-12', 1)];
    expect(openTaskCounts(tasks, logs, '2024-06-12')).toEqual({ day: 0, week: 0, month: 0 });
    expect(openTaskCounts(tasks, logs, '2024-06-13')).toEqual({ day: 1, week: 0, month: 0 });
    expect(openTaskCounts(tasks, logs, '2024-06-17')).toEqual({ day: 1, week: 1, month: 0 });
  });

  test('a completed week and month reappear unchecked in their next periods', () => {
    const weekly = mkGoal({ id: 'weekly', kind: 'task', timeframe: 'week', startDate: '2026-09-28', endDate: null });
    const monthly = mkGoal({ id: 'monthly', kind: 'task', timeframe: 'month', startDate: '2026-09-01', endDate: null });
    const logs = [log('weekly', '2026-10-04', 1), log('monthly', '2026-09-30', 1)];
    expect(openTaskCounts([weekly, monthly], logs, '2026-10-05')).toEqual({ day: 0, week: 1, month: 1 });
    expect(taskLogChanges(weekly, logs, '2026-10-05')).toEqual([log('weekly', '2026-10-05', 1)]);
  });
});

describe('task toggle value', () => {
  test('clears a weekly task completed on a different day', () => {
    const weekly = { ...task, timeframe: 'week' as const };
    const logs = [log('t', '2024-06-10', 1)];
    const next = taskLogChanges(weekly, logs, '2024-06-12').reduce(applyLog, { goals: [weekly], logs });
    expect(isTaskDone(weekly, next.logs, '2024-06-12')).toBe(false);
  });
  test('unchecked → fills the remainder to done', () => {
    expect(isTaskDone(task, [], '2024-06-10')).toBe(false);
    const v = taskToggleValue(task, [], '2024-06-10');
    expect(v).toBe(1);
    // writing that value makes the task done
    expect(isTaskDone(task, [log('t', '2024-06-10', v)], '2024-06-10')).toBe(true);
  });
  test('checked → clears to 0', () => {
    const logs = [log('t', '2024-06-10', 1)];
    expect(isTaskDone(task, logs, '2024-06-10')).toBe(true);
    expect(taskToggleValue(task, logs, '2024-06-10')).toBe(0);
  });
});

describe('task period changes', () => {
  test('copying a closed weekly task creates a separate unchecked task this week', () => {
    const source = mkGoal({ id: 'old', kind: 'task', timeframe: 'week', startDate: '2026-09-28', endDate: '2026-10-04' });
    const current = mkGoal({ id: 'current', kind: 'task', timeframe: 'week', startDate: '2026-10-05', endDate: null });
    const copied = copyTaskIntoPeriod(source, [source, current], '2026-10-05');
    expect(copied.deletes).toEqual([]);
    expect(copied.updates).toEqual([{ id: current.id, title: current.title, target: current.target, weight: 50, endDate: null }]);
    expect(copied.creates).toEqual([{ kind: 'task', title: source.title, timeframe: 'week', target: 1,
      weight: 50, startDate: '2026-10-05', endDate: '2026-10-11' }]);
  });

  test.each(['day', 'week', 'month'] as const)('%s toggle clears only the selected period and restores completion', (timeframe) => {
    const item = { ...task, timeframe };
    const completedDate = timeframe === 'day' ? '2024-06-12' : '2024-06-10';
    const previous = log('t', '2024-05-01', 1);
    const nextPeriod = log('t', '2024-07-01', 1);
    const otherTask = log('other', completedDate, 1);
    const initial = { goals: [item], logs: [previous, log('t', completedDate, 1), nextPeriod, otherTask] };
    const cleared = taskLogChanges(item, initial.logs, '2024-06-12').reduce(applyLog, initial);
    expect(isTaskDone(item, cleared.logs, '2024-06-12')).toBe(false);
    expect(cleared.logs).toEqual([previous, nextPeriod, otherTask]);
    const restored = taskLogChanges(item, cleared.logs, '2024-06-12').reduce(applyLog, cleared);
    expect(isTaskDone(item, restored.logs, '2024-06-12')).toBe(true);
  });

  test('explicit uncheck clears every positive in-window entry but leaves inactive dates', () => {
    const item = { ...task, timeframe: 'month' as const, startDate: '2024-06-10', endDate: '2024-06-20' };
    const logs = [log('t', '2024-06-09', 1), log('t', '2024-06-10', 1), log('t', '2024-06-12', 1), log('t', '2024-06-21', 1)];
    expect(taskLogChanges(item, logs, '2024-06-12', false)).toEqual([
      log('t', '2024-06-10', 0), log('t', '2024-06-12', 0),
    ]);
  });

  test('explicit completion is idempotent and replaces the selected day with its maximum', () => {
    const item = { ...task, timeframe: 'week' as const };
    const logs = [log('t', '2024-06-10', 0.25), log('t', '2024-06-12', 0.25)];
    const completed = taskLogChanges(item, logs, '2024-06-12', true).reduce(applyLog, { goals: [item], logs });
    expect(completed.logs).toContainEqual(log('t', '2024-06-12', 0.75));
    expect(taskLogChanges(item, completed.logs, '2024-06-12', true).reduce(applyLog, completed)).toEqual(completed);
  });
});

describe('actions do not toggle the task', () => {
  test('stops event propagation and opens actions only', () => {
    const stopPropagation = jest.fn();
    const onActions = jest.fn();
    handleActionPress({ stopPropagation }, onActions);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onActions).toHaveBeenCalledTimes(1);
  });

  test('is a no-op when no action handler is provided (still stops propagation)', () => {
    const stopPropagation = jest.fn();
    expect(() => handleActionPress({ stopPropagation }, undefined)).not.toThrow();
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });
});
