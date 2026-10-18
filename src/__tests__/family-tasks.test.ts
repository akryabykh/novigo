import { describe, expect, test } from '@jest/globals';
import type { FamilyOperation, FamilySnapshot, FamilyTask } from '../features/family/family-data';
import { applyFamilyOperation, familyOpenCounts, familyRings, familyTasksForPeriod, overlayFamily } from '../features/family/family-logic';

const familyId = 'family-1';
const base: FamilySnapshot = {
  family: { id: familyId, inviteCode: 'AAAAAAAAAAAAAAAA', timeZone: 'Europe/Moscow', memberCount: 2 },
  tasks: [
    { id: 'monday', familyId, title: 'Посуда', timeframe: 'day', periodStart: '2026-10-19', done: false, createdBy: 'partner' },
    { id: 'week', familyId, title: 'Покупки', timeframe: 'week', periodStart: '2026-10-19', done: true, createdBy: 'me' },
    { id: 'month', familyId, title: 'Счета', timeframe: 'month', periodStart: '2026-10-01', done: false, createdBy: 'partner' },
  ],
};

const op = (patch: Partial<FamilyOperation>): FamilyOperation => ({
  id: 'op', familyId, taskId: 'monday', action: 'toggle', title: null,
  timeframe: null, periodStart: null, done: true, requestedAt: '2026-10-19T10:00:00Z', ...patch,
});

describe('shared family tasks', () => {
  test('keeps day, week and month tasks in their own calendar periods', () => {
    expect(familyTasksForPeriod(base.tasks, 'day', '2026-10-19').map((task) => task.id)).toEqual(['monday']);
    expect(familyTasksForPeriod(base.tasks, 'day', '2026-10-20')).toEqual([]);
    expect(familyTasksForPeriod(base.tasks, 'week', '2026-10-25').map((task) => task.id)).toEqual(['week']);
    expect(familyTasksForPeriod(base.tasks, 'week', '2026-10-26')).toEqual([]);
    expect(familyTasksForPeriod(base.tasks, 'month', '2026-10-31').map((task) => task.id)).toEqual(['month']);
    expect(familyOpenCounts(base.tasks, '2026-10-19')).toEqual({ day: 1, week: 0, month: 1 });
    expect(familyRings(base.tasks, '2026-10-19')).toEqual({ day: 0, week: 1, month: 0 });
  });

  test('lets either member check or delete a task, and never resurrects a deleted task', () => {
    const checked = applyFamilyOperation(base, op({}), 'me');
    expect(checked.tasks.find((task) => task.id === 'monday')?.done).toBe(true);
    const afterDelete = overlayFamily(base, [op({ action: 'delete' }), op({ id: 'late-toggle' })], 'partner');
    expect(afterDelete.tasks.find((task) => task.id === 'monday')).toBeUndefined();
  });

  test('does not duplicate an offline creation after replay', () => {
    const create = op({ action: 'create', taskId: 'new', title: 'Погулять', timeframe: 'day', periodStart: '2026-10-19', done: null });
    const once = applyFamilyOperation(base, create, 'me');
    expect(applyFamilyOperation(once, create, 'me').tasks.filter((task: FamilyTask) => task.id === 'new')).toHaveLength(1);
  });
});
