import { describe, expect, test } from '@jest/globals';
import { canLogOn, isPeriodEditable } from '../core/logic';
import { at, mkGoal } from './fixtures';

const TODAY = '2024-12-31';
const dayGoal = mkGoal({ timeframe: 'day', startDate: '2024-01-01', endDate: null });

describe('canLogOn blocks future and inactive dates', () => {
  test('future date is blocked', () => {
    expect(canLogOn(dayGoal, '2025-01-01', TODAY, at(2025, 1, 1))).toBe(false);
  });
  test('before the goal start is blocked', () => {
    const g = mkGoal({ timeframe: 'day', startDate: '2024-06-15', endDate: null });
    expect(canLogOn(g, '2024-06-10', TODAY, at(2024, 6, 10, 12))).toBe(false);
  });
  test('after the goal end is blocked', () => {
    const g = mkGoal({ timeframe: 'day', startDate: '2024-01-01', endDate: '2024-06-05' });
    expect(canLogOn(g, '2024-06-10', TODAY, at(2024, 6, 10, 12))).toBe(false);
  });
  test('active + past-but-within-grace is allowed', () => {
    expect(canLogOn(dayGoal, '2024-06-10', TODAY, at(2024, 6, 11, 12))).toBe(true);
  });
});

describe('24-hour edit grace after a period ends', () => {
  test('a day stays editable through the next day, then locks', () => {
    // day 2024-06-10 → editable until 2024-06-12 00:00 local
    expect(isPeriodEditable('day', '2024-06-10', at(2024, 6, 11, 12))).toBe(true);
    expect(isPeriodEditable('day', '2024-06-10', at(2024, 6, 12, 1))).toBe(false);
  });

  test('a past day you forgot to close becomes read-only via canLogOn', () => {
    expect(canLogOn(dayGoal, '2024-06-10', TODAY, at(2024, 6, 11, 23))).toBe(true);
    expect(canLogOn(dayGoal, '2024-06-10', TODAY, at(2024, 6, 12, 1))).toBe(false);
  });

  test('a week locks 24h after Sunday ends', () => {
    // week of 2024-06-12 ends Sun 2024-06-16 → editable until 2024-06-18 00:00
    expect(isPeriodEditable('week', '2024-06-12', at(2024, 6, 17, 12))).toBe(true);
    expect(isPeriodEditable('week', '2024-06-12', at(2024, 6, 18, 1))).toBe(false);
  });

  test('a month locks 24h after the last day ends', () => {
    // June ends 2024-06-30 → editable until 2024-07-02 00:00
    expect(isPeriodEditable('month', '2024-06-12', at(2024, 7, 1, 12))).toBe(true);
    expect(isPeriodEditable('month', '2024-06-12', at(2024, 7, 2, 1))).toBe(false);
  });
});
