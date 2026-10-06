import { expect, jest, test } from '@jest/globals';
import {
  acknowledgeCounter, adjustCounter, applyCounterOperation, EMPTY_COUNTER, enqueueCounter,
  formatCounterValue, loadCounterRecord, parseCounterRecord, visibleCounter,
} from '../features/counter/counter-store';

const mockValues = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockValues.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockValues.set(key, value); },
  },
}));

test('counter starts at 0000, stays nonnegative and has no four-digit cap', () => {
  expect(formatCounterValue(EMPTY_COUNTER.value)).toBe('0000');
  expect(formatCounterValue(12)).toBe('0012');
  expect(formatCounterValue(10000)).toBe('10000');
  expect(adjustCounter(EMPTY_COUNTER, -1).value).toBe(0);
  expect(adjustCounter({ value: 9999, snapshots: [] }, 1).value).toBe(10000);
  expect(adjustCounter({ value: Number.MAX_SAFE_INTEGER, snapshots: [] }, 1).value).toBe(Number.MAX_SAFE_INTEGER);
});

test('old local counter is queued for one-time import, including its history', () => {
  const legacy = JSON.stringify({ value: 37, snapshots: [{ id: 'old-1', value: 12, savedAt: '2026-10-06T12:00:00.000Z' }] });
  const record = parseCounterRecord(legacy);
  expect(record.pending.map((op) => op.type)).toEqual(['delta', 'snapshot']);
  expect(visibleCounter(record).value).toBe(37);
  expect(visibleCounter(record).snapshots[0].value).toBe(12);
  expect(parseCounterRecord(JSON.stringify(record))).toEqual(record);
});

test('acknowledgement preserves actions queued while an earlier batch was in flight', async () => {
  const uid = 'counter-queue-test';
  await enqueueCounter(uid, { id: 'first-operation', type: 'delta', delta: 1 });
  await enqueueCounter(uid, { id: 'second-operation', type: 'delta', delta: 1 });
  const record = await acknowledgeCounter(uid, ['first-operation'], { value: 5, snapshots: [] });
  expect(record.pending.map((op) => op.id)).toEqual(['second-operation']);
  expect(visibleCounter(record).value).toBe(6);
  expect((await loadCounterRecord(uid)).pending).toHaveLength(1);
  expect(JSON.parse(mockValues.get(`novigo.counter.${uid}`)!).pending).toHaveLength(1);
});

test('reset and history clearing are separate actions', () => {
  const saved = applyCounterOperation({ value: 4, snapshots: [] }, {
    id: 'snapshot-operation', type: 'snapshot', value: 4, savedAt: '2026-10-06T12:00:00.000Z',
  });
  const reset = applyCounterOperation(saved, { id: 'reset-operation', type: 'reset' });
  expect(reset.value).toBe(0);
  expect(reset.snapshots).toHaveLength(1);
  expect(applyCounterOperation(reset, { id: 'clear-operation', type: 'clear' }).snapshots).toHaveLength(0);
});
