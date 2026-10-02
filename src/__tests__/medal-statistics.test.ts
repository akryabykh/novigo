import { expect, test } from '@jest/globals';
import { bestStreak, medalTier, monthlyStats, type MedalPeriodResult } from '../features/statistics/logic';

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

test('tier thresholds keep gold after 200', () => {
  expect([0, 1, 49, 50, 99, 100, 200, 250].map(medalTier))
    .toEqual([null, 'bronze', 'bronze', 'silver', 'silver', 'gold', 'gold', 'gold']);
});

test('weekly completions belong to the month of Sunday', () => {
  const results = [
    period('week', '2026-09-28', '2026-10-04', true),
    period('week', '2026-10-26', '2026-11-01', true),
    period('day', '2026-10-01', '2026-10-01', true),
  ];
  expect(monthlyStats(results, '2026-10-15')).toEqual({
    daysCompleted: 1, daysTotal: 31, weeksCompleted: 1, weeksTotal: 4,
  });
});
