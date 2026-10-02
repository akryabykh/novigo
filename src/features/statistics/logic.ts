import type { Timeframe } from '../../core/domain';
import { addDays, endOfMonth, startOfMonth, weekdayMon0 } from '../../core/logic';
import { addMonths } from '../calendar/format';

export interface MedalPeriodResult {
  timeframe: Timeframe;
  periodStart: string;
  periodEnd: string;
  completed: boolean;
}

export type MedalTier = 'bronze' | 'silver' | 'gold';

export function medalTier(record: number): MedalTier | null {
  return record >= 100 ? 'gold' : record >= 50 ? 'silver' : record >= 1 ? 'bronze' : null;
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
    daysTotal,
    weeksCompleted: results.filter((r) => r.timeframe === 'week' && r.completed && r.periodEnd >= first && r.periodEnd <= last).length,
    weeksTotal,
  };
}
