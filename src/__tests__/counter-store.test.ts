import { expect, jest, test } from '@jest/globals';
import { adjustCounter, EMPTY_COUNTER, formatCounterValue, loadCounter, persistCounter } from '../features/counter/counter-store';

const mockValues = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockValues.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockValues.set(key, value); },
  },
}));

test('counter stays nonnegative and has no four-digit cap', () => {
  expect(formatCounterValue(EMPTY_COUNTER.value)).toBe('0000');
  expect(formatCounterValue(12)).toBe('0012');
  expect(formatCounterValue(10000)).toBe('10000');
  expect(adjustCounter(EMPTY_COUNTER, -1).value).toBe(0);
  expect(adjustCounter({ value: 9999, snapshots: [] }, 1).value).toBe(10000);
  expect(adjustCounter({ value: Number.MAX_SAFE_INTEGER, snapshots: [] }, 1).value).toBe(Number.MAX_SAFE_INTEGER);
});

test('rapid changes persist in order and belong to the signed-in user', async () => {
  const first = persistCounter('counter-user-a', { value: 1, snapshots: [] });
  const second = persistCounter('counter-user-a', { value: 2, snapshots: [{
    id: 'saved-1', value: 2, savedAt: '2026-10-06T12:00:00.000Z',
  }] });
  await Promise.all([first, second]);
  expect((await loadCounter('counter-user-a')).value).toBe(2);
  expect(JSON.parse(mockValues.get('novigo.counter.counter-user-a')!).snapshots).toHaveLength(1);
  const firstOpen = await loadCounter('counter-user-b');
  expect(firstOpen).toEqual(EMPTY_COUNTER);
  expect(formatCounterValue(firstOpen.value)).toBe('0000');
});
