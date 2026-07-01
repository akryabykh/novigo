// Row <-> domain mappers. DB is snake_case; domain is camelCase.
import type { Achievement, AchievementCode, DailyLog, Goal, Profile } from '../domain';

export interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string | null;
  middle_name: string | null;
  xp: number;
  level: number;
  current_streak: number;
  best_streak: number;
}
export interface GoalRow {
  id: string;
  user_id: string;
  title: string;
  timeframe: Goal['timeframe'];
  target: number | string;
  weight: number | string;
}
export interface DailyLogRow {
  id: string;
  goal_id: string;
  date: string;
  value: number | string;
}
export interface AchievementRow {
  id: string;
  user_id: string;
  code: string;
  unlocked_at: string;
}

const num = (v: number | string): number => (typeof v === 'string' ? parseFloat(v) : v);

export const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  middleName: r.middle_name,
  xp: r.xp,
  level: r.level,
  currentStreak: r.current_streak,
  bestStreak: r.best_streak,
});

export const toGoal = (r: GoalRow): Goal => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  timeframe: r.timeframe,
  target: num(r.target),
  weight: num(r.weight),
});

export const toDailyLog = (r: DailyLogRow): DailyLog => ({
  goalId: r.goal_id,
  date: r.date,
  value: num(r.value),
});

export const toAchievement = (r: AchievementRow): Achievement => ({
  id: r.id,
  userId: r.user_id,
  code: r.code as AchievementCode,
  unlockedAt: r.unlocked_at,
});
