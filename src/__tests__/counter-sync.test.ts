import { expect, jest, test } from '@jest/globals';
import { enqueueCounter, loadCounterRecord, visibleCounter } from '../features/counter/counter-store';
import { syncCounter } from '../features/counter/counter-sync';

const mockValues = new Map<string, string>();
let mockTitle = 'Счётчик';
const mockRpc = jest.fn(async (name: string, args?: { p_title?: string }) => {
  if (name === 'set_counter_title') mockTitle = args?.p_title ?? mockTitle;
  return { data: { title: mockTitle, value: 2, snapshots: [] }, error: null };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockValues.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockValues.set(key, value); },
  },
}));
jest.mock('../core/data/supabase', () => ({ supabase: { rpc: (...args: [string, { p_title?: string }?]) => mockRpc(...args) } }));

test('offline action is acknowledged against the server value without losing another device change', async () => {
  const uid = 'counter-sync-user';
  await enqueueCounter(uid, { id: 'operation-from-device-a', type: 'delta', delta: 1 });
  await syncCounter(uid);
  const record = await loadCounterRecord(uid);
  expect(record.pending).toHaveLength(0);
  expect(visibleCounter(record).value).toBe(2);
  expect(mockRpc.mock.calls.map((call) => call[0])).toEqual(['apply_counter_operations', 'get_counter_state']);
});

test('a full refresh waits for a background pending-only sync', async () => {
  mockRpc.mockClear();
  const uid = 'counter-refresh-user';
  await Promise.all([syncCounter(uid, true), syncCounter(uid)]);
  expect(mockRpc.mock.calls.map((call) => call[0]).filter((name) => name === 'get_counter_state')).toHaveLength(1);
  expect(visibleCounter(await loadCounterRecord(uid)).value).toBe(2);
});

test('counter title is synchronized through its own idempotent operation', async () => {
  const uid = 'counter-title-user';
  await enqueueCounter(uid, { id: 'rename-operation', type: 'rename', title: 'Подходы' });
  await syncCounter(uid);
  expect(visibleCounter(await loadCounterRecord(uid)).title).toBe('Подходы');
  expect(mockRpc.mock.calls.map((call) => call[0])).toContain('set_counter_title');
});
