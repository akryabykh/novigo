// ============================================================
// Gamification engine — derives XP / level / streaks / achievements from
// the active session's data. Pure + idempotent (recomputed from scratch).
// Streak day = day-ring of that day >= threshold.
// ============================================================
import type { AchievementCode, DailyLog, Goal, GoalSession } from '../../core/domain';
import {
  XP,
  WEEKS_IN_SESSION,
  clampAsOf,
  computeRings,
  computeStreaks,
  currentWeekIndex,
  dayGoalsOn,
  enumerateDates,
  levelFromXp,
  todayISO,
  weekRange,
} from '../../core/logic';
import { STREAK_ACTIVE_THRESHOLD } from '../../ui/theme';

export interface Bundle {
  session: GoalSession;
  goals: Goal[];
  logs: DailyLog[];
}

function sumInRange(goalId: string, logs: DailyLog[], start: string, end: string): number {
  let s = 0;
  for (const l of logs) if (l.goalId === goalId && l.date >= start && l.date <= end) s += l.value;
  return s;
}

/** Session dates (<= asOf) whose day-ring met the active threshold. */
export function activeDates(b: Bundle, today: string = todayISO()): string[] {
  const asOf = clampAsOf(b.session.startDate, today);
  return enumerateDates(b.session.startDate, asOf).filter((d) => {
    const ring = dayGoalsOn(b.goals, b.logs, d);
    return ring != null && ring >= STREAK_ACTIVE_THRESHOLD;
  });
}

export function computeXp(b: Bundle, today: string = todayISO()): number {
  const asOf = clampAsOf(b.session.startDate, today);
  let xp = 0;

  const dayGoals = b.goals.filter((g) => g.timeframe === 'day');
  const weekGoals = b.goals.filter((g) => g.timeframe === 'week');
  const monthGoals = b.goals.filter((g) => g.timeframe === 'month');

  // +10 per day a daily goal hits target
  for (const g of dayGoals) {
    for (const d of enumerateDates(b.session.startDate, asOf)) {
      if (sumInRange(g.id, b.logs, d, d) >= g.target) xp += XP.PER_GOAL;
    }
  }

  // +10 per completed week for each weekly goal
  const lastWeek = currentWeekIndex(b.session.startDate, asOf);
  for (const g of weekGoals) {
    for (let wi = 0; wi <= lastWeek; wi++) {
      const { start, end } = weekRange(b.session.startDate, wi);
      const cap = end < asOf ? end : asOf;
      if (sumInRange(g.id, b.logs, start, cap) >= g.target) xp += XP.PER_GOAL;
    }
  }

  // +10 per completed monthly goal
  for (const g of monthGoals) {
    if (sumInRange(g.id, b.logs, b.session.startDate, asOf) >= g.target) xp += XP.PER_GOAL;
  }

  // +5 per perfect day (day-ring == 100%)
  for (const d of enumerateDates(b.session.startDate, asOf)) {
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

  const asOf = clampAsOf(b.session.startDate, today);
  const perfectDay = enumerateDates(b.session.startDate, asOf).some((d) => {
    const ring = dayGoalsOn(b.goals, b.logs, d);
    return ring != null && ring >= 1;
  });
  if (perfectDay) codes.push('perfect_day');

  if (computeRings(b.session, b.goals, b.logs, today).month >= 1) codes.push('session_master');

  return codes;
}

export { WEEKS_IN_SESSION };
