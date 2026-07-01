// ============================================================
// Gamification engine — derives XP / level / streaks / achievements from the
// user's recurring goals + logs. Pure + idempotent (recomputed from scratch).
// Calendar model: streak day = day-ring of that day >= threshold.
// ============================================================
import type { AchievementCode, DailyLog, Goal } from '../../core/domain';
import {
  XP,
  computeRings,
  computeStreaks,
  dayGoalsOn,
  endOfMonth,
  endOfWeek,
  enumerateDates,
  levelFromXp,
  startOfMonth,
  startOfWeek,
  todayISO,
} from '../../core/logic';
import { STREAK_ACTIVE_THRESHOLD } from '../../ui/theme';

export interface Bundle {
  goals: Goal[];
  logs: DailyLog[];
}

function sumInRange(goalId: string, logs: DailyLog[], start: string, end: string): number {
  let s = 0;
  for (const l of logs) if (l.goalId === goalId && l.date >= start && l.date <= end) s += l.value;
  return s;
}

const min = (a: string, b: string): string => (a < b ? a : b);

/** Every calendar date from the earliest log up to today (empty if no logs). */
function historyDates(b: Bundle, today: string): string[] {
  let earliest: string | null = null;
  for (const l of b.logs) if (earliest == null || l.date < earliest) earliest = l.date;
  if (earliest == null || earliest > today) return [];
  return enumerateDates(earliest, today);
}

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

/** Dates whose day-ring met the active threshold. */
export function activeDates(b: Bundle, today: string = todayISO()): string[] {
  return historyDates(b, today).filter((d) => {
    const ring = dayGoalsOn(b.goals, b.logs, d);
    return ring != null && ring >= STREAK_ACTIVE_THRESHOLD;
  });
}

export function computeXp(b: Bundle, today: string = todayISO()): number {
  const days = historyDates(b, today);
  if (days.length === 0) return 0;
  let xp = 0;

  const dayGoals = b.goals.filter((g) => g.timeframe === 'day');
  const weekGoals = b.goals.filter((g) => g.timeframe === 'week');
  const monthGoals = b.goals.filter((g) => g.timeframe === 'month');

  // +10 per day a daily goal hits its target
  for (const g of dayGoals) {
    for (const d of days) if (sumInRange(g.id, b.logs, d, d) >= g.target) xp += XP.PER_GOAL;
  }

  // +10 per calendar week a weekly goal hits its target
  const weekStarts = distinct(days.map(startOfWeek));
  for (const g of weekGoals) {
    for (const ws of weekStarts) {
      if (sumInRange(g.id, b.logs, ws, min(endOfWeek(ws), today)) >= g.target) xp += XP.PER_GOAL;
    }
  }

  // +10 per calendar month a monthly goal hits its target
  const monthStarts = distinct(days.map(startOfMonth));
  for (const g of monthGoals) {
    for (const ms of monthStarts) {
      if (sumInRange(g.id, b.logs, ms, min(endOfMonth(ms), today)) >= g.target) xp += XP.PER_GOAL;
    }
  }

  // +5 per perfect day (day-ring == 100%)
  for (const d of days) {
    const ring = dayGoalsOn(b.goals, b.logs, d);
    if (ring != null && ring >= 1) xp += XP.PERFECT_DAY;
  }

  return xp;
}

export interface ProfileStats {
  xp: number;
  level: number;
  currentStreak: number;
  bestStreak: number;
}

export function computeProfileStats(b: Bundle, today: string = todayISO()): ProfileStats {
  const xp = computeXp(b, today);
  const { level } = levelFromXp(xp);
  const { current, best } = computeStreaks(activeDates(b, today), today);
  return { xp, level, currentStreak: current, bestStreak: best };
}

export function detectAchievements(b: Bundle, today: string = todayISO()): AchievementCode[] {
  const codes: AchievementCode[] = [];
  if (b.logs.some((l) => l.value > 0)) codes.push('first_step');

  const { best } = computeStreaks(activeDates(b, today), today);
  if (best >= 7) codes.push('week_streak');

  const perfectDay = historyDates(b, today).some((d) => {
    const ring = dayGoalsOn(b.goals, b.logs, d);
    return ring != null && ring >= 1;
  });
  if (perfectDay) codes.push('perfect_day');

  // "session_master" repurposed: current calendar month ring at 100%.
  if (computeRings(b.goals, b.logs, today).month >= 1) codes.push('session_master');

  return codes;
}
