// Domain types. Core entities (Program/Task/DailyLog) live with the pure logic
// (single source); here we re-export them and add the user-facing entities.
export type { Period, GoalType, ProgramStatus, Task, DailyLog, Program } from '../logic';

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
  | 'first_step' // первое выполнение
  | 'week_streak' // 7 дней подряд
  | 'program_complete' // завершённая программа
  | 'perfect_program'; // 100% программы

export interface Achievement {
  id: string;
  userId: string;
  code: AchievementCode;
  unlockedAt: string;
}

/** Catalog used by the Progress screen to render locked/unlocked medallions. */
export const ACHIEVEMENTS: { code: AchievementCode; emoji: string; title: string }[] = [
  { code: 'first_step', emoji: '👟', title: 'Первый шаг' },
  { code: 'week_streak', emoji: '🔥', title: '7 дней подряд' },
  { code: 'program_complete', emoji: '🏁', title: 'Программа завершена' },
  { code: 'perfect_program', emoji: '💎', title: '100% программы' },
];
