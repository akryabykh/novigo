import { expect, jest, test } from '@jest/globals';
import { changeStopwatch, readStopwatch, type WorkSession } from '../features/stopwatch/stopwatch-store';
import { syncStopwatch } from '../features/stopwatch/stopwatch-sync';

const mockValues = new Map<string, string>();
const mockUpsert = jest.fn(async (_rows: unknown) => ({ error: null }));
const remote = [{ id: 'from-device-b', task_id: null, task_title: 'План',
  started_at: '2026-10-06T09:00:00.000Z', ended_at: '2026-10-06T09:02:00.000Z', duration_ms: 120000 }];
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockValues.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockValues.set(key, value); },
  },
}));
jest.mock('../core/data/supabase', () => ({
  supabase: { from: () => ({
    upsert: (rows: unknown) => mockUpsert(rows),
    select: () => ({ eq: () => ({ order: async () => ({ data: remote, error: null }) }) }),
  }) },
}));

test('finished work is uploaded once and sessions from another device appear in history', async () => {
  const uid = 'stopwatch-sync-user';
  const local: WorkSession = { id: 'from-device-a', taskId: null, taskTitle: 'План',
    startedAt: '2026-10-06T10:00:00.000Z', endedAt: '2026-10-06T10:03:00.000Z', durationMs: 180000 };
  await changeStopwatch(uid, (record) => ({ ...record, sessions: [local], pending: [local] }));
  await syncStopwatch(uid);
  const result = await readStopwatch(uid);
  expect(mockUpsert).toHaveBeenCalledTimes(1);
  expect(result.pending).toHaveLength(0);
  expect(result.sessions.map((item) => item.id).sort()).toEqual(['from-device-a', 'from-device-b']);
});
