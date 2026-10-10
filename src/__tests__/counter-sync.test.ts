import { expect, jest, test } from '@jest/globals';
import {
  applyCounterOperation, EMPTY_COLLECTION, enqueueCounter, loadCounterRecord,
  selectedCounter, visibleCounters, type CounterCollection, type CounterOperation,
} from '../features/counter/counter-store';
import { syncCounter } from '../features/counter/counter-sync';

const mockValues = new Map<string, string>();
let mockServer: CounterCollection = EMPTY_COLLECTION;
const mockReceipts = new Set<string>();
const mockRpc = jest.fn(async (name: string, args?: { p_actions?: CounterOperation[] }) => {
  if (name === 'apply_counter_actions') {
    for (const action of args?.p_actions ?? []) {
      if (mockReceipts.has(action.id)) continue;
      mockServer = applyCounterOperation(mockServer, action);
      mockReceipts.add(action.id);
    }
  }
  return { data: mockServer, error: null };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockValues.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockValues.set(key, value); },
  },
}));
jest.mock('../core/data/supabase', () => ({ supabase: { rpc: (...args: [string, { p_actions?: CounterOperation[] }?]) => mockRpc(...args) } }));

test('offline actions synchronize per counter without changing another counter', async () => {
  const uid = 'counter-sync-user';
  await enqueueCounter(uid, { id: 'create-operation', type: 'create', counterId: 'steps', title: 'Шаги' });
  await enqueueCounter(uid, { id: 'count-operation', type: 'delta', counterId: 'steps', delta: 2 });
  await syncCounter(uid);
  const record = await loadCounterRecord(uid);
  expect(record.pending).toHaveLength(0);
  expect(selectedCounter(record)).toMatchObject({ title: 'Шаги', value: 2 });
  expect(visibleCounters(record).counters.find((item) => item.id === 'default')?.value).toBe(0);
  expect(mockRpc.mock.calls.map((call) => call[0])).toEqual(['apply_counter_actions', 'get_counters_state']);
});

test('a full refresh waits for a background pending-only sync', async () => {
  mockRpc.mockClear();
  const uid = 'counter-refresh-user';
  await Promise.all([syncCounter(uid, true), syncCounter(uid)]);
  expect(mockRpc.mock.calls.map((call) => call[0]).filter((name) => name === 'get_counters_state')).toHaveLength(1);
});

test('renaming and deleting a counter are synchronized', async () => {
  mockRpc.mockClear();
  const uid = 'counter-rename-user';
  await enqueueCounter(uid, { id: 'create-second', type: 'create', counterId: 'books', title: 'Книги' });
  await enqueueCounter(uid, { id: 'rename-second', type: 'rename', counterId: 'books', title: 'Прочитано' });
  await syncCounter(uid);
  expect(selectedCounter(await loadCounterRecord(uid))?.title).toBe('Прочитано');
  await enqueueCounter(uid, { id: 'delete-second', type: 'delete', counterId: 'books' });
  await syncCounter(uid);
  expect(visibleCounters(await loadCounterRecord(uid)).counters.some((item) => item.id === 'books')).toBe(false);
});

test('a tap made during a server refresh is still sent before sync finishes', async () => {
  mockRpc.mockClear();
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  mockRpc.mockImplementationOnce(async () => {
    await gate;
    return { data: mockServer, error: null };
  });
  const uid = 'counter-in-flight-user';
  const first = syncCounter(uid);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await enqueueCounter(uid, { id: 'late-operation', type: 'delta', counterId: 'default', delta: 1 });
  const second = syncCounter(uid);
  release();
  await Promise.all([first, second]);
  expect((await loadCounterRecord(uid)).pending).toHaveLength(0);
  expect(mockRpc.mock.calls.map((call) => call[0])).toContain('apply_counter_actions');
});
