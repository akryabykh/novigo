// Shared test fixtures.
import type { DailyLog, Goal, GoalKind, Timeframe } from '../core/logic';

let seq = 0;

export function mkGoal(p: Partial<Goal> & { timeframe: Timeframe }): Goal {
  return {
    id: p.id ?? `g${seq++}`,
    userId: p.userId ?? 'u1',
    kind: (p.kind ?? 'goal') as GoalKind,
    title: p.title ?? 'Goal',
    timeframe: p.timeframe,
    target: p.target ?? 1,
    weight: p.weight ?? 100,
    startDate: p.startDate ?? '2000-01-01',
    endDate: p.endDate ?? null,
  };
}

export const log = (goalId: string, date: string, value: number): DailyLog => ({ goalId, date, value });

/** Local-time ms for a wall-clock instant (matches the app's 24h-grace math). */
export const at = (y: number, m: number, d: number, h = 0): number => new Date(y, m - 1, d, h).getTime();
