import { describe, expect, test } from '@jest/globals';
import { goalsForScope, isActiveOn } from '../core/logic';
import { mkGoal } from './fixtures';

describe('isActiveOn', () => {
  const g = mkGoal({ timeframe: 'day', startDate: '2024-06-10', endDate: '2024-06-20' });

  test('inside the window inclusive', () => {
    expect(isActiveOn(g, '2024-06-10')).toBe(true);
    expect(isActiveOn(g, '2024-06-20')).toBe(true);
    expect(isActiveOn(g, '2024-06-15')).toBe(true);
  });
  test('outside the window', () => {
    expect(isActiveOn(g, '2024-06-09')).toBe(false);
    expect(isActiveOn(g, '2024-06-21')).toBe(false);
  });
  test('endDate null = forever', () => {
    const forever = mkGoal({ timeframe: 'day', startDate: '2024-06-10', endDate: null });
    expect(isActiveOn(forever, '2030-01-01')).toBe(true);
    expect(isActiveOn(forever, '2024-06-09')).toBe(false);
  });
});

describe('goalsForScope', () => {
  const daily = mkGoal({ id: 'd', timeframe: 'day', startDate: '2024-06-01', endDate: null });
  const weekly = mkGoal({ id: 'w', timeframe: 'week', startDate: '2024-06-01', endDate: null });
  const monthly = mkGoal({ id: 'm', timeframe: 'month', startDate: '2024-06-01', endDate: null });
  const pastDaily = mkGoal({ id: 'pd', timeframe: 'day', startDate: '2024-01-01', endDate: '2024-01-31' });
  const goals = [daily, weekly, monthly, pastDaily];

  test('filters by timeframe and period overlap', () => {
    expect(goalsForScope(goals, 'day', '2024-06-12').map((g) => g.id)).toEqual(['d']);
    expect(goalsForScope(goals, 'week', '2024-06-12').map((g) => g.id)).toEqual(['w']);
    expect(goalsForScope(goals, 'month', '2024-06-12').map((g) => g.id)).toEqual(['m']);
  });

  test('excludes goals whose active window does not overlap the period', () => {
    // a day goal from January must not appear when viewing a June day
    expect(goalsForScope(goals, 'day', '2024-06-12').map((g) => g.id)).not.toContain('pd');
    // but it does appear inside its own window
    expect(goalsForScope(goals, 'day', '2024-01-15').map((g) => g.id)).toEqual(['pd']);
  });

  test('week scope includes a weekly goal whose window overlaps any day of that week', () => {
    const wk = mkGoal({ id: 'wk', timeframe: 'week', startDate: '2024-06-16', endDate: '2024-06-16' });
    // week of 2024-06-12 is Mon 10 .. Sun 16 → overlaps on the 16th
    expect(goalsForScope([wk], 'week', '2024-06-12').map((g) => g.id)).toEqual(['wk']);
  });
});
