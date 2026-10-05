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
