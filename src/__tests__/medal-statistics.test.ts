import { expect, test } from '@jest/globals';
import { bestStreak, isPerfectPeriod, medalTier, monthlyStats, type MedalPeriodResult } from '../features/statistics/logic';

const period = (timeframe: MedalPeriodResult['timeframe'], start: string, end: string, completed: boolean): MedalPeriodResult => ({
  timeframe, periodStart: start, periodEnd: end, completed,
});

test('a failed or missing day breaks the current run without lowering the best record', () => {
  const results = [
    period('day', '2026-10-01', '2026-10-01', true),
    period('day', '2026-10-02', '2026-10-02', true),
    period('day', '2026-10-03', '2026-10-03', true),
    period('day', '2026-10-04', '2026-10-04', false),
    period('day', '2026-10-05', '2026-10-05', true),
    period('day', '2026-10-06', '2026-10-06', true),
    period('day', '2026-10-08', '2026-10-08', true),
  ];
  expect(bestStreak(results, 'day')).toBe(3);
});

test('week and month streaks use their own calendar boundaries', () => {
  const results = [
    period('week', '2026-09-28', '2026-10-04', true),
    period('week', '2026-10-05', '2026-10-11', true),
    period('month', '2026-09-01', '2026-09-30', true),
    period('month', '2026-10-01', '2026-10-31', true),
  ];
  expect(bestStreak(results, 'week')).toBe(2);
  expect(bestStreak(results, 'month')).toBe(2);
  expect(bestStreak(results, 'day')).toBe(0);
});

test('each medal reaches silver and gold on a useful timescale', () => {
  expect([0, 1, 6, 7, 29, 30, 200].map((n) => medalTier(n, 'day')))
    .toEqual([null, 'bronze', 'bronze', 'silver', 'silver', 'gold', 'gold']);
  expect([1, 3, 4, 11, 12].map((n) => medalTier(n, 'week')))
    .toEqual(['bronze', 'bronze', 'silver', 'silver', 'gold']);
  expect([1, 2, 3, 5, 6].map((n) => medalTier(n, 'month')))
    .toEqual(['bronze', 'bronze', 'silver', 'silver', 'gold']);
});

test('weekly completions belong to the month of Sunday', () => {
  const results = [
    period('week', '2026-09-28', '2026-10-04', true),
    period('week', '2026-10-26', '2026-11-01', true),
    period('day', '2026-10-01', '2026-10-01', true),
  ];
  expect(monthlyStats(results, '2026-10-15')).toEqual({
    daysCompleted: 1, daysPerfect: 1, daysTotal: 31, daysRest: 0,
    weeksCompleted: 1, weeksPerfect: 1, weeksTotal: 4,
  });
});

test('an empty planned rest day pauses the daily streak without counting as a completion', () => {
  const results: MedalPeriodResult[] = [
    period('day', '2026-10-01', '2026-10-01', true),
    { ...period('day', '2026-10-02', '2026-10-02', false), restDay: true },
    period('day', '2026-10-03', '2026-10-03', true),
    period('day', '2026-10-04', '2026-10-04', false),
    { ...period('day', '2026-10-05', '2026-10-05', false), restDay: true },
    period('day', '2026-10-06', '2026-10-06', true),
  ];
  expect(bestStreak(results, 'day')).toBe(2);
  expect(monthlyStats(results, '2026-10-15')).toMatchObject({
    daysCompleted: 3, daysRest: 2, daysTotal: 29,
  });
});

test('80%-qualified periods count toward records while perfect remains separate', () => {
  const results: MedalPeriodResult[] = [
    { ...period('month', '2026-08-01', '2026-08-31', true), perfect: false, completionPercent: 80 },
    { ...period('month', '2026-09-01', '2026-09-30', true), perfect: true, completionPercent: 100 },
    { ...period('month', '2026-10-01', '2026-10-31', false), perfect: false, completionPercent: 79 },
  ];
  expect(bestStreak(results, 'month')).toBe(2);
  expect(results.map(isPerfectPeriod)).toEqual([false, true, false]);
  expect(isPerfectPeriod(period('day', '2026-01-01', '2026-01-01', true))).toBe(true);
});
