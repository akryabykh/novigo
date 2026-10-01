import { expect, jest, test } from '@jest/globals';
import { applyOperation } from '../features/offline/sync';
import { nextTaskPeriod, taskMoveDates } from '../features/goals/task-move';
import { openTaskCounts } from '../features/goals/task-row-logic';
import { log, mkGoal } from './fixtures';

jest.mock('../core/data', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('../features/gamification/sync', () => ({ syncGamification: jest.fn() }));

test('next period follows the selected day, Monday-based week, or calendar month', () => {
  expect(nextTaskPeriod('day', '2026-10-01')).toEqual({ to: 'day', startDate: '2026-10-02', endDate: '2026-10-02' });
  expect(nextTaskPeriod('week', '2026-10-01')).toEqual({ to: 'week', startDate: '2026-10-05', endDate: '2026-10-11' });
  expect(nextTaskPeriod('month', '2026-10-01')).toEqual({ to: 'month', startDate: '2026-11-01', endDate: '2026-11-30' });
  expect(taskMoveDates('month', '2027-02-17')).toEqual({ startDate: '2027-02-01', endDate: '2027-02-28' });
});

test('offline move keeps the task identity, changes its period, and resets its checkmark', () => {
  const task = mkGoal({ id: 'task-1', kind: 'task', timeframe: 'month', startDate: '2026-10-01', endDate: '2026-10-31' });
  const other = mkGoal({ id: 'task-2', kind: 'task', timeframe: 'week' });
  const moved = applyOperation({ goals: [task, other], logs: [log(task.id, '2026-10-01', 1), log(other.id, '2026-10-01', 1)] }, {
    id: 'move-1', type: 'move', taskId: task.id, from: 'month', to: 'day', startDate: '2026-10-04', endDate: '2026-10-04',
    expectedSourceRevision: 1, expectedDestinationRevision: 0,
  });
  expect(moved.goals).toContainEqual({ ...task, timeframe: 'day', startDate: '2026-10-04', endDate: '2026-10-04' });
  expect(moved.goals).toHaveLength(2);
  expect(moved.logs).toEqual([log(other.id, '2026-10-01', 1)]);
  expect(openTaskCounts(moved.goals, moved.logs, '2026-10-04')).toEqual({ day: 1, week: 0, month: 0 });
});
