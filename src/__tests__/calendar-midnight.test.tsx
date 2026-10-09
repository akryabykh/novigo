import { afterEach, expect, jest, test } from '@jest/globals';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useCalendar, type Calendar } from '../features/calendar/useCalendar';

jest.mock('react-native', () => ({ Platform: { OS: 'web' }, AppState: { addEventListener: () => ({ remove: () => {} }) } }));

let tree: ReactTestRenderer;
let calendar: Calendar;
function Harness() {
  const value = useCalendar();
  useEffect(() => { calendar = value; });
  return null;
}

afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  jest.useRealTimers();
});

test('the selected today follows the calendar into a new week at midnight', async () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 4, 23, 59, 59));
  await act(async () => { tree = create(<Harness />); });
  expect(calendar.today).toBe('2026-10-04');
  await act(async () => { jest.advanceTimersByTime(1100); });
  expect(calendar.today).toBe('2026-10-05');
  expect(calendar.refDate).toBe('2026-10-05');
});

test('midnight leaves an intentionally selected historical date in place', async () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 4, 23, 59, 59));
  await act(async () => { tree = create(<Harness />); });
  await act(async () => { calendar.setRefDate('2026-10-01'); });
  await act(async () => { jest.advanceTimersByTime(1100); });
  expect(calendar.today).toBe('2026-10-05');
  expect(calendar.refDate).toBe('2026-10-01');
});

test.each<['week' | 'month', string]>([
  ['week', '2026-10-09'],
  ['week', '2026-09-01'],
  ['month', '2026-10-09'],
  ['month', '2026-09-01'],
])('Today returns from %s at %s to the current day', async (scope, selectedDate) => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 9, 12));
  await act(async () => { tree = create(<Harness />); });
  await act(async () => {
    calendar.setScope(scope);
    calendar.setRefDate(selectedDate);
  });
  await act(async () => { calendar.goToday(); });
  expect(calendar.scope).toBe('day');
  expect(calendar.refDate).toBe('2026-10-09');
});
