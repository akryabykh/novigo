import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { QueryClient } from '@tanstack/react-query';

import { qk } from '../core/query';
import { listGoalsByUser, listLogsByGoals, supabase } from '../core/data';
import { mkGoal } from './fixtures';
import { loadOfflineWorkspace, queueHorizon, queueTaskMove, resolveOfflineConflict, synchronize } from '../features/offline/sync';
import { readOffline } from '../features/offline/store';

jest.mock('../core/data', () => ({
  listGoalsByUser: jest.fn(), listLogsByGoals: jest.fn(),
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));
jest.mock('../features/gamification/sync', () => ({ syncGamification: jest.fn() }));
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });

const uid = '11111111-1111-4111-8111-111111111111';
const old = mkGoal({ id: '22222222-2222-4222-8222-222222222222', userId: uid, timeframe: 'day' });
const create = { kind: 'goal' as const, title: 'Новая цель', timeframe: 'day' as const,
  target: 1, weight: 50, startDate: '2026-10-01', endDate: null };

describe('phone offline queue', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
    jest.mocked(supabase.rpc).mockReset();
    jest.mocked(supabase.from).mockReset();
    jest.mocked(listGoalsByUser).mockReset();
    jest.mocked(listLogsByGoals).mockReset();
  });
  test('a task move survives offline and replays once with both revision checks', async () => {
    const moveUid = '66666666-6666-4666-8666-666666666666';
    const task = mkGoal({ id: '77777777-7777-4777-8777-777777777777', userId: moveUid,
      kind: 'task', timeframe: 'month', startDate: '2026-10-01', endDate: '2026-10-31' });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(qk.workspace(moveUid), { goals: [task], logs: [{ goalId: task.id, date: '2026-10-01', value: 1 }],
      revisions: { 'task:month': 2, 'task:day': 3 } });
    await queueTaskMove(moveUid, { taskId: task.id, from: 'month', to: 'day',
      startDate: '2026-10-04', endDate: '2026-10-04' }, qc);
    expect((await readOffline(moveUid)).operations).toHaveLength(1);
    expect(qc.getQueryData<{ goals: typeof task[]; logs: unknown[] }>(qk.workspace(moveUid))?.goals[0].timeframe).toBe('day');
    expect(qc.getQueryData<{ logs: unknown[] }>(qk.workspace(moveUid))?.logs).toEqual([]);

    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    jest.mocked(supabase.rpc).mockReset().mockResolvedValue({ data: { source: 3, destination: 4 }, error: null } as never);
    jest.mocked(listGoalsByUser).mockResolvedValue([{ ...task, timeframe: 'day', startDate: '2026-10-04', endDate: '2026-10-04' }]);
    jest.mocked(listLogsByGoals).mockResolvedValue([]);
    jest.mocked(supabase.from).mockReturnValue({ select: () => ({ eq: async () => ({ data: [
      { kind: 'task', timeframe: 'month', revision: 3 }, { kind: 'task', timeframe: 'day', revision: 4 },
    ], error: null }) }) } as never);
    await synchronize(moveUid, qc);
    expect(supabase.rpc).toHaveBeenCalledWith('apply_offline_task_move', expect.objectContaining({
      p_task_id: task.id, p_from: 'month', p_to: 'day',
      p_expected_source_revision: 2, p_expected_destination_revision: 3,
    }));
    expect((await readOffline(moveUid)).operations).toEqual([]);
    qc.clear();
  });

  test('a goal create survives a closed view and syncs once on reconnect', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(qk.workspace(uid), { goals: [old], logs: [], revisions: { 'goal:day': 0 } });
    await queueHorizon(uid, 'goal', 'day', '2026-10-01', {
      updates: [{ id: old.id, title: old.title, target: old.target, weight: 50, endDate: old.endDate }],
      creates: [create], deletes: [],
    }, qc);
    const stored = await readOffline(uid);
    expect(stored.operations).toHaveLength(1);
    expect(stored.operations[0].type).toBe('horizon');
    const createdId = stored.operations[0].type === 'horizon' ? stored.operations[0].input.creates[0].id : '';
    expect(createdId).toMatch(/^[0-9a-f-]{36}$/);
    qc.removeQueries({ queryKey: qk.workspace(uid) });
    const restored = await loadOfflineWorkspace(uid, qc);
    expect(restored.goals.map((goal) => goal.id)).toContain(createdId);

    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 2, error: null } as never);
    jest.mocked(listGoalsByUser).mockResolvedValue([old, { ...create, id: createdId!, userId: uid }]);
    jest.mocked(listLogsByGoals).mockResolvedValue([]);
    jest.mocked(supabase.from).mockReturnValue({ select: () => ({ eq: async () => ({ data: [{ kind: 'goal', timeframe: 'day', revision: 2 }], error: null }) }) } as never);
    await synchronize(uid, qc);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(await readOffline(uid)).toMatchObject({ operations: [], conflictId: null });
    qc.clear();
  });

  test('a remote edit stops the queue until the user chooses which version to keep', async () => {
    const otherUid = '33333333-3333-4333-8333-333333333333';
    const original = { ...old, userId: otherUid, title: 'Исходная' };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(qk.workspace(otherUid), { goals: [original], logs: [], revisions: { 'goal:day': 0 } });
    await queueHorizon(otherUid, 'goal', 'day', '2026-10-01', {
      updates: [{ id: original.id, title: 'Моя правка', target: 1, weight: 100, endDate: null }],
      creates: [], deletes: [],
    }, qc);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    jest.mocked(supabase.rpc).mockReset();
    jest.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'offline_conflict' } } as never)
      .mockResolvedValue({ data: 2, error: null } as never);
    const remoteAdded = { ...original, id: '44444444-4444-4444-8444-444444444444', title: 'Добавлено на ПК', weight: 50 };
    jest.mocked(listGoalsByUser).mockResolvedValue([{ ...original, title: 'Правка с ПК', weight: 50 }, remoteAdded]);
    jest.mocked(listLogsByGoals).mockResolvedValue([]);
    jest.mocked(supabase.from).mockReturnValue({ select: () => ({ eq: async () => ({ data: [{ kind: 'goal', timeframe: 'day', revision: 1 }], error: null }) }) } as never);
    await synchronize(otherUid, qc);
    expect((await readOffline(otherUid)).conflictId).toBeTruthy();
    expect(jest.mocked(supabase.rpc)).toHaveBeenCalledTimes(1);
    await resolveOfflineConflict(otherUid, 'mine', qc);
    await synchronize(otherUid, qc);
    expect((await readOffline(otherUid)).operations).toHaveLength(0);
    expect(jest.mocked(supabase.rpc)).toHaveBeenCalledTimes(2);
    expect(jest.mocked(supabase.rpc).mock.calls[1][1]).toMatchObject({ p_deletes: [remoteAdded.id] });
    qc.clear();
  });
});
