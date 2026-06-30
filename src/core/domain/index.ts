// Domain types. Core entities (Goal/GoalSession/DailyLog/Timeframe) live with the
// pure logic (single source); here we re-export them and add user-facing entities.
export type { Timeframe, Goal, GoalSession, DailyLog } from '../logic';

export interface Profile {
  id: string;
  firstName: string;
  lastName?: string | null;
  middleName?: string | null;
  xp: number;
  level: number;
  currentStreak: number;
  bestStreak: number;
}

export type AchievementCode =
  | 'first_step' // первая отметка
  | 'week_streak' // 7 дней подряд
  | 'perfect_day' // 100% дневного кольца
  | 'session_master'; // сессия пройдена на 100%

export interface Achievement {
  id: string;
  userId: string;
  code: AchievementCode;
  unlockedAt: string;
}

export const ACHIEVEMENTS: { code: AchievementCode; emoji: string; title: string }[] = [
  { code: 'first_step', emoji: '👟', title: 'Первый шаг' },
  { code: 'week_streak', emoji: '🔥', title: '7 дней подряд' },
  { code: 'perfect_day', emoji: '⭐️', title: 'Идеальный день' },
  { code: 'session_master', emoji: '💎', title: 'Сессия на 100%' },
];
