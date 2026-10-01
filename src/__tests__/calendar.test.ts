import { describe, expect, test } from '@jest/globals';
import {
  daysBetween,
  endOfMonth,
  endOfWeek,
  enumerateDates,
  periodRange,
  startOfMonth,
  startOfWeek,
  weekdayMon0,
  weeksOfMonth,
} from '../core/logic';
import { addMonths, periodTitle } from '../features/calendar/format';

describe('calendar boundaries (week starts Monday)', () => {
  test('day heading shows the weekday and date even when it is today', () => {
    expect(periodTitle('day', '2026-10-01', '2026-10-01')).toBe('Чт, 1 октября');
    expect(periodTitle('day', '2027-01-01', '2026-10-01')).toBe('Пт, 1 января 2027');
  });
  test('weekdayMon0: Monday=0 … Sunday=6', () => {
    expect(weekdayMon0('2024-01-01')).toBe(0); // Mon
    expect(weekdayMon0('2024-01-07')).toBe(6); // Sun
    expect(weekdayMon0('2024-01-03')).toBe(2); // Wed
  });

  test('startOfWeek / endOfWeek span Mon..Sun', () => {
    expect(startOfWeek('2024-01-03')).toBe('2024-01-01');
    expect(endOfWeek('2024-01-03')).toBe('2024-01-07');
    expect(startOfWeek('2024-01-01')).toBe('2024-01-01');
    expect(endOfWeek('2024-01-07')).toBe('2024-01-07');
  });

  test('startOfMonth / endOfMonth incl. leap February', () => {
    expect(startOfMonth('2024-02-15')).toBe('2024-02-01');
    expect(endOfMonth('2024-02-15')).toBe('2024-02-29'); // leap
    expect(endOfMonth('2023-02-10')).toBe('2023-02-28'); // non-leap
    expect(endOfMonth('2024-12-05')).toBe('2024-12-31');
  });

  test('weeksOfMonth covers every Monday intersecting the month', () => {
    const weeks = weeksOfMonth('2024-02-10');
    expect(weeks[0]).toBe('2024-01-29'); // Monday before Feb 1 (Thu)
    expect(weeks).toContain('2024-02-26');
    expect(weeks.length).toBe(5);
  });

  test('periodRange for day / week / month', () => {
    expect(periodRange('day', '2024-06-10')).toEqual({ start: '2024-06-10', end: '2024-06-10' });
    expect(periodRange('week', '2024-06-12')).toEqual({ start: '2024-06-10', end: '2024-06-16' });
    expect(periodRange('month', '2024-06-12')).toEqual({ start: '2024-06-01', end: '2024-06-30' });
  });

  test('enumerateDates / daysBetween', () => {
    expect(enumerateDates('2024-01-30', '2024-02-02')).toEqual([
      '2024-01-30', '2024-01-31', '2024-02-01', '2024-02-02',
    ]);
    expect(daysBetween('2024-02-27', '2024-03-01')).toBe(3); // 2024 leap
    expect(daysBetween('2023-02-27', '2023-03-01')).toBe(2);
  });
});

describe('addMonths transitions (month & year rollover, day clamping)', () => {
  test('crosses year boundary', () => {
    expect(addMonths('2024-12-15', 1)).toBe('2025-01-15');
    expect(addMonths('2025-01-15', -1)).toBe('2024-12-15');
  });
  test('clamps day to shorter target month', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // leap Feb
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28'); // non-leap Feb
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
  });
});
