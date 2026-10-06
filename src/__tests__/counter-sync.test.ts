import { expect, jest, test } from '@jest/globals';
import { enqueueCounter, loadCounterRecord, visibleCounter } from '../features/counter/counter-store';
import { syncCounter } from '../features/counter/counter-sync';

const mockValues = new Map<string, string>();
const mockRpc = jest.fn(async (name: string) => {
  if (name === 'apply_counter_operations') return { data: { value: 2, snapshots: [] }, error: null };
  return { data: { value: 2, snapshots: [] }, error: null };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockValues.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockValues.set(key, value); },
  },
}));
jest.mock('../core/data/supabase', () => ({ supabase: { rpc: (...args: [string]) => mockRpc(...args) } }));

test('offline action is acknowledged against the server value without losing another device change', async () => {
  const uid = 'counter-sync-user';
  await enqueueCounter(uid, { id: 'operation-from-device-a', type: 'delta', delta: 1 });
  await syncCounter(uid);
  const record = await loadCounterRecord(uid);
  expect(record.pending).toHaveLength(0);
  expect(visibleCounter(record).value).toBe(2);
  expect(mockRpc.mock.calls.map((call) => call[0])).toEqual(['apply_counter_operations']);
});

test('a full refresh waits for a background pending-only sync', async () => {
  const uid = 'counter-refresh-user';
  await Promise.all([syncCounter(uid, true), syncCounter(uid)]);
  expect(mockRpc.mock.calls.map((call) => call[0]).filter((name) => name === 'get_counter_state')).toHaveLength(1);
  expect(visibleCounter(await loadCounterRecord(uid)).value).toBe(2);
});
