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
  test('active day is editable before local midnight', () => {
    expect(canLogOn(dayGoal, '2024-06-10', TODAY, at(2024, 6, 10, 23))).toBe(true);
  });
});

describe('periods close at local midnight with no edit grace', () => {
  test('a day locks exactly when the next day starts', () => {
    expect(isPeriodEditable('day', '2024-06-10', at(2024, 6, 10, 23))).toBe(true);
    expect(isPeriodEditable('day', '2024-06-10', at(2024, 6, 11))).toBe(false);
  });

  test('a past day you forgot to close becomes read-only via canLogOn', () => {
    expect(canLogOn(dayGoal, '2024-06-10', TODAY, at(2024, 6, 11))).toBe(false);
  });

  test('a week locks at Monday midnight', () => {
    expect(isPeriodEditable('week', '2024-06-12', at(2024, 6, 16, 23))).toBe(true);
    expect(isPeriodEditable('week', '2024-06-12', at(2024, 6, 17))).toBe(false);
  });

  test('a month locks at midnight on the first', () => {
    expect(isPeriodEditable('month', '2024-06-12', at(2024, 6, 30, 23))).toBe(true);
    expect(isPeriodEditable('month', '2024-06-12', at(2024, 7, 1))).toBe(false);
  });
});
