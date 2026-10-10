import { expect, jest, test } from '@jest/globals';
import {
  acknowledgeCounter, adjustCounter, applyCounterOperation, DEFAULT_COUNTER_ID, EMPTY_COLLECTION,
  EMPTY_COUNTER, enqueueCounter, formatCounterValue, loadCounterRecord, parseCounterRecord,
  selectCounter, selectedCounter, visibleCounters,
} from '../features/counter/counter-store';

const mockValues = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockValues.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockValues.set(key, value); },
  },
}));

test('first counter starts at 0000, stays nonnegative and has no four-digit cap', () => {
  expect(formatCounterValue(EMPTY_COUNTER.value)).toBe('0000');
  expect(formatCounterValue(12)).toBe('0012');
  expect(formatCounterValue(10000)).toBe('10000');
  expect(adjustCounter(EMPTY_COUNTER, -1).value).toBe(0);
  expect(adjustCounter({ ...EMPTY_COUNTER, value: 9999 }, 1).value).toBe(10000);
  expect(adjustCounter({ ...EMPTY_COUNTER, value: Number.MAX_SAFE_INTEGER }, 1).value).toBe(Number.MAX_SAFE_INTEGER);
});

test('old single counter keeps its value, title, history and unsent actions', () => {
  const old = JSON.stringify({ version: 2,
    base: { title: 'Подходы', value: 37, snapshots: [{ id: 'old-1', value: 12, savedAt: '2026-10-06T12:00:00.000Z' }] },
    pending: [{ id: 'pending-1', type: 'delta', delta: 1 }],
  });
  const record = parseCounterRecord(old);
  expect(record.version).toBe(3);
  expect(record.pending[0]).toMatchObject({ counterId: DEFAULT_COUNTER_ID, type: 'delta' });
  expect(selectedCounter(record)).toMatchObject({ title: 'Подходы', value: 38 });
  expect(selectedCounter(record)?.snapshots[0].value).toBe(12);
  expect(parseCounterRecord(JSON.stringify(record))).toEqual(record);
});

test('device-only counter data is queued for one-time import', () => {
  const legacy = JSON.stringify({ value: 37, snapshots: [{ id: 'old-1', value: 12, savedAt: '2026-10-06T12:00:00.000Z' }] });
  const record = parseCounterRecord(legacy);
  expect(record.pending.map((op) => op.type)).toEqual(['delta', 'snapshot']);
  expect(selectedCounter(record)?.value).toBe(37);
  expect(selectedCounter(record)?.snapshots[0].value).toBe(12);
});

test('new counters are independent and deleting one keeps the others intact', () => {
  const created = applyCounterOperation(EMPTY_COLLECTION, { id: 'create-1', type: 'create', counterId: 'pushups', title: 'Отжимания' });
  const counted = applyCounterOperation(created, { id: 'delta-1', type: 'delta', counterId: 'pushups', delta: 6 });
  const saved = applyCounterOperation(counted, { id: 'saved-1', type: 'snapshot', counterId: 'pushups', value: 6,
    savedAt: '2026-10-06T12:00:00.000Z' });
  expect(saved.counters.find((item) => item.id === 'pushups')).toMatchObject({ title: 'Отжимания', value: 6 });
  expect(saved.counters.find((item) => item.id === DEFAULT_COUNTER_ID)?.value).toBe(0);
  const deleted = applyCounterOperation(saved, { id: 'delete-1', type: 'delete', counterId: 'pushups' });
  expect(deleted.counters.map((item) => item.id)).toEqual([DEFAULT_COUNTER_ID]);
  expect(saved.counters.find((item) => item.id === 'pushups')?.snapshots).toHaveLength(1);
});

test('selection survives acknowledgement and is saved on this device', async () => {
  const uid = 'counter-selection-user';
  await enqueueCounter(uid, { id: 'create-operation', type: 'create', counterId: 'reading', title: 'Страницы' });
  await enqueueCounter(uid, { id: 'count-operation', type: 'delta', counterId: 'reading', delta: 3 });
  expect(selectedCounter(await loadCounterRecord(uid))?.title).toBe('Страницы');
  await selectCounter(uid, DEFAULT_COUNTER_ID);
  const server = { counters: [EMPTY_COUNTER, { ...EMPTY_COUNTER, id: 'reading', title: 'Страницы' }] };
  const acknowledged = await acknowledgeCounter(uid, ['create-operation'], server);
  expect(selectedCounter(acknowledged)?.id).toBe(DEFAULT_COUNTER_ID);
  expect(acknowledged.pending.map((op) => op.id)).toEqual(['count-operation']);
  expect(visibleCounters(acknowledged).counters.find((item) => item.id === 'reading')?.value).toBe(3);
  expect(JSON.parse(mockValues.get(`novigo.counter.${uid}`)!).selectedId).toBe(DEFAULT_COUNTER_ID);
});

test('deleting the final counter shows an empty collection', () => {
  const record = parseCounterRecord(null);
  const next = { ...record, pending: [{ id: 'delete-final', type: 'delete' as const, counterId: DEFAULT_COUNTER_ID }] };
  expect(visibleCounters(next).counters).toEqual([]);
  expect(selectedCounter(next)).toBeNull();
});
