import { describe, expect, test } from '@jest/globals';
import { computeRings, goalCardProgress, goalMaxOnDate } from '../core/logic';
import { log, mkGoal } from './fixtures';

const REF = '2024-06-12'; // Wed; its week is Mon 2024-06-10 .. Sun 2024-06-16
const week = ['2024-06-10', '2024-06-11', '2024-06-12', '2024-06-13', '2024-06-14', '2024-06-15', '2024-06-16'];

describe('day ring + target cap', () => {
  const daily = mkGoal({ id: 'd', timeframe: 'day', target: 3 });

  test('reaches 1 at target', () => {
    expect(computeRings([daily], [log('d', REF, 3)], REF).day).toBeCloseTo(1);
  });
  test('never exceeds 1 (overshoot capped)', () => {
    expect(computeRings([daily], [log('d', REF, 5)], REF).day).toBeCloseTo(1);
    expect(goalCardProgress(daily, [log('d', REF, 99)], REF)).toBeCloseTo(1);
  });
});

test('task checkboxes have equal ring weight after a move, regardless of their former stored weights', () => {
  const tasks = [mkGoal({ id: 'a', kind: 'task', timeframe: 'day', weight: 100 }),
    mkGoal({ id: 'b', kind: 'task', timeframe: 'day', weight: 20 })];
  expect(computeRings(tasks, [log('b', REF, 1)], REF).day).toBeCloseTo(0.5);
});

describe('week ring = 60% day-part + 40% week-part (missing half = 0)', () => {
  test('only daily goals, perfect all week → 0.6', () => {
    const daily = mkGoal({ id: 'd', timeframe: 'day', target: 1 });
    const logs = week.map((d) => log('d', d, 1));
    expect(computeRings([daily], logs, REF).week).toBeCloseTo(0.6);
  });

  test('only a weekly goal, perfect → 0.4', () => {
    const weekly = mkGoal({ id: 'w', timeframe: 'week', target: 5 });
    const logs = [log('w', '2024-06-10', 2), log('w', '2024-06-12', 3)];
    expect(computeRings([weekly], logs, REF).week).toBeCloseTo(0.4);
  });

  test('daily perfect + weekly perfect → 1.0', () => {
    const daily = mkGoal({ id: 'd', timeframe: 'day', target: 1 });
    const weekly = mkGoal({ id: 'w', timeframe: 'week', target: 2 });
    const logs = [...week.map((d) => log('d', d, 1)), log('w', '2024-06-11', 2)];
    expect(computeRings([daily, weekly], logs, REF).week).toBeCloseTo(1);
  });
});

describe('dynamic day denominator (average only over days with active goals)', () => {
  test('goal active 4 of 7 days, perfect those 4 → day-part = 1 → week = 0.6', () => {
    const daily = mkGoal({ id: 'd', timeframe: 'day', target: 1, startDate: '2024-06-10', endDate: '2024-06-13' });
    const logs = ['2024-06-10', '2024-06-11', '2024-06-12', '2024-06-13'].map((d) => log('d', d, 1));
    expect(computeRings([daily], logs, REF).week).toBeCloseTo(0.6);
  });

  test('contrast: active all 7 days, perfect only 4 → day-part = 4/7 → week ≈ 0.343', () => {
    const daily = mkGoal({ id: 'd', timeframe: 'day', target: 1, startDate: '2024-06-01', endDate: null });
    const logs = ['2024-06-10', '2024-06-11', '2024-06-12', '2024-06-13'].map((d) => log('d', d, 1));
    expect(computeRings([daily], logs, REF).week).toBeCloseTo(0.6 * (4 / 7), 3);
  });
});

describe('month ring = 80% weeks-part + 20% month-part (dynamic week denominator)', () => {
  test('only a monthly goal, perfect → weeks-part missing → month = 0.2', () => {
    const monthly = mkGoal({ id: 'm', timeframe: 'month', target: 10 });
    expect(computeRings([monthly], [log('m', '2024-06-05', 10)], '2024-06-15').month).toBeCloseTo(0.2);
  });

  test('daily goal active one full week only → weeks-part averages that single week', () => {
    const daily = mkGoal({ id: 'd', timeframe: 'day', target: 1, startDate: '2024-06-10', endDate: '2024-06-16' });
    const logs = week.map((d) => log('d', d, 1));
    // that week's ring = 0.6; it is the only week with active goals → weeks-part = 0.6
    // month = 0.8 * 0.6 = 0.48
    expect(computeRings([daily], logs, '2024-06-15').month).toBeCloseTo(0.48);
  });
});

describe('goalMaxOnDate never lets a period exceed its target', () => {
  const weekly = mkGoal({ id: 'w', timeframe: 'week', target: 5 });
  const logs = [log('w', '2024-06-10', 2), log('w', '2024-06-11', 2)];

  test('remaining room on an empty day', () => {
    expect(goalMaxOnDate(weekly, logs, '2024-06-12')).toBe(1); // 5 - (2+2)
  });
  test('room accounts for the edited day itself', () => {
    expect(goalMaxOnDate(weekly, logs, '2024-06-11')).toBe(3); // 5 - 2(other day)
  });
});
