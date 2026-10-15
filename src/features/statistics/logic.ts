import type { Timeframe } from '../../core/domain';
import { addDays, endOfMonth, startOfMonth, weekdayMon0 } from '../../core/logic';
import { addMonths } from '../calendar/format';

export interface MedalPeriodResult {
  timeframe: Timeframe;
  periodStart: string;
  periodEnd: string;
  completed: boolean;
  /** Old cached results have no perfect field; previously completed meant 100%. */
  perfect?: boolean;
  completionPercent?: number | null;
}

export type MedalTier = 'bronze' | 'silver' | 'gold';

export const MEDAL_THRESHOLDS: Record<Timeframe, { silver: number; gold: number }> = {
  day: { silver: 7, gold: 30 },
  week: { silver: 4, gold: 12 },
  month: { silver: 3, gold: 6 },
};

export function medalTier(record: number, timeframe: Timeframe): MedalTier | null {
  const { silver, gold } = MEDAL_THRESHOLDS[timeframe];
  return record >= gold ? 'gold' : record >= silver ? 'silver' : record >= 1 ? 'bronze' : null;
}

export function isPerfectPeriod(result: MedalPeriodResult): boolean {
  return result.perfect ?? result.completed;
}

function nextPeriod(start: string, timeframe: Timeframe): string {
  return timeframe === 'day' ? addDays(start, 1)
    : timeframe === 'week' ? addDays(start, 7)
    : addMonths(start, 1);
}

/** Only finalized results are passed in. A missing or empty period breaks the run. */
export function bestStreak(results: MedalPeriodResult[], timeframe: Timeframe): number {
  const ordered = results.filter((result) => result.timeframe === timeframe)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  let best = 0;
  let streak = 0;
  let previous: string | null = null;
  for (const period of ordered) {
    streak = period.completed ? (previous && period.periodStart === nextPeriod(previous, timeframe) ? streak + 1 : 1) : 0;
    best = Math.max(best, streak);
    previous = period.periodStart;
  }
  return best;
}

export function monthlyStats(results: MedalPeriodResult[], date: string) {
  const first = startOfMonth(date);
  const last = endOfMonth(date);
  const daysTotal = Number(last.slice(-2));
  let weeksTotal = 0;
  for (let d = first; d <= last; d = addDays(d, 1)) {
    if (weekdayMon0(d) === 6) weeksTotal++;
  }
  return {
    daysCompleted: results.filter((r) => r.timeframe === 'day' && r.completed && r.periodEnd >= first && r.periodEnd <= last).length,
    daysPerfect: results.filter((r) => r.timeframe === 'day' && isPerfectPeriod(r) && r.periodEnd >= first && r.periodEnd <= last).length,
    daysTotal,
    weeksCompleted: results.filter((r) => r.timeframe === 'week' && r.completed && r.periodEnd >= first && r.periodEnd <= last).length,
    weeksPerfect: results.filter((r) => r.timeframe === 'week' && isPerfectPeriod(r) && r.periodEnd >= first && r.periodEnd <= last).length,
    weeksTotal,
  };
}
