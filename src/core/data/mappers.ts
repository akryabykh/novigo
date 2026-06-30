// Row <-> domain mappers. DB is snake_case; domain is camelCase.
import type { Achievement, AchievementCode, DailyLog, Profile, Program, Task } from '../domain';

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
export interface ProgramRow {
  id: string;
  user_id: string;
  title: string;
  period: Program['period'];
  start_date: string;
  end_date: string;
  status: Program['status'];
}
export interface TaskRow {
  id: string;
  program_id: string;
  title: string;
  goal_type: Task['goalType'];
  target: number | string;
  unit: string | null;
  weight: number | string;
}
export interface DailyLogRow {
  id: string;
  task_id: string;
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

export const toProgram = (r: ProgramRow): Program => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  period: r.period,
  startDate: r.start_date,
  endDate: r.end_date,
  status: r.status,
});

export const toTask = (r: TaskRow): Task => ({
  id: r.id,
  programId: r.program_id,
  title: r.title,
  goalType: r.goal_type,
  target: num(r.target),
  unit: r.unit ?? undefined,
  weight: num(r.weight),
});

export const toDailyLog = (r: DailyLogRow): DailyLog => ({
  taskId: r.task_id,
  date: r.date,
  value: num(r.value),
});

export const toAchievement = (r: AchievementRow): Achievement => ({
  id: r.id,
  userId: r.user_id,
  code: r.code as AchievementCode,
  unlockedAt: r.unlocked_at,
});
