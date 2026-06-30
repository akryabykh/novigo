// ============================================================
// Gamification engine — derives XP / level / streaks / achievements
// from raw data. Pure + idempotent: always recomputed from scratch so
// re-running never double-counts. Built on core/logic.
// ============================================================
import type { AchievementCode, DailyLog, Program, Task } from '../../core/domain';
import {
  XP,
  enumerateDates,
  levelFromXp,
  computeStreaks,
  programProgress,
  todayISO,
} from '../../core/logic';
import { STREAK_ACTIVE_THRESHOLD } from '../../ui/theme';

interface Bundle {
  programs: Program[];
  tasks: Task[];
  logs: DailyLog[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function logIndex(logs: DailyLog[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of logs) m.set(`${l.taskId}|${l.date}`, l.value);
  return m;
}

/** A program "covers" a date if active/completed and date within [start..end]. */
function programsCovering(date: string, programs: Program[]): Program[] {
  return programs.filter(
    (p) => p.status !== 'archived' && p.startDate <= date && date <= p.endDate,
  );
}

/** Average daily completion (0..1) across all daily tasks whose program covers `date`. */
export function dayProgress(date: string, { programs, tasks, logs }: Bundle): number {
  const idx = logIndex(logs);
  const covering = new Set(programsCovering(date, programs).map((p) => p.id));
  const dailyTasks = tasks.filter((t) => t.goalType === 'daily' && covering.has(t.programId));
  if (dailyTasks.length === 0) return 0;
  const sum = dailyTasks.reduce(
    (s, t) => s + clamp01((idx.get(`${t.id}|${date}`) ?? 0) / t.target),
    0,
  );
  return sum / dailyTasks.length;
}

/** Dates (<= today) whose daily progress met the active-day threshold. */
export function activeDates(bundle: Bundle, today: string = todayISO()): string[] {
  const dates = [...new Set(bundle.logs.map((l) => l.date))].filter((d) => d <= today);
  return dates.filter((d) => dayProgress(d, bundle) >= STREAK_ACTIVE_THRESHOLD);
}

/** Total XP, recomputed from data (idempotent). */
export function computeXp(bundle: Bundle, today: string = todayISO()): number {
  const { programs, tasks } = bundle;
  const idx = logIndex(bundle.logs);
  const programById = new Map(programs.map((p) => [p.id, p] as const));
  let xp = 0;

  // +10 per completed task (period: whole target; daily: per day target hit)
  for (const t of tasks) {
    const program = programById.get(t.programId);
    if (!program || program.status === 'archived') continue;
    if (t.goalType === 'period') {
      const total = bundle.logs
        .filter((l) => l.taskId === t.id)
        .reduce((s, l) => s + l.value, 0);
      if (total >= t.target) xp += XP.PER_TASK;
    } else {
      const lastDay = program.endDate < today ? program.endDate : today;
      for (const d of enumerateDates(program.startDate, lastDay)) {
        if ((idx.get(`${t.id}|${d}`) ?? 0) >= t.target) xp += XP.PER_TASK;
      }
    }
  }

  // +5 per perfect day (all covering daily tasks at 100%)
  const loggedDates = [...new Set(bundle.logs.map((l) => l.date))].filter((d) => d <= today);
  for (const d of loggedDates) {
    if (dayProgress(d, bundle) >= 1) xp += XP.PERFECT_DAY;
  }

  // +100 per completed program
  for (const p of programs) {
    if (p.status === 'completed') xp += XP.PROGRAM_COMPLETE;
  }

  return xp;
}

export interface ProfileStats {
  xp: number;
  level: number;
  currentStreak: number;
  bestStreak: number;
}

export function computeProfileStats(bundle: Bundle, today: string = todayISO()): ProfileStats {
  const xp = computeXp(bundle, today);
  const { level } = levelFromXp(xp);
  const { current, best } = computeStreaks(activeDates(bundle, today), today);
  return { xp, level, currentStreak: current, bestStreak: best };
}

/** Which achievement codes the data currently satisfies. */
export function detectAchievements(bundle: Bundle, today: string = todayISO()): AchievementCode[] {
  const codes: AchievementCode[] = [];
  const { best } = computeStreaks(activeDates(bundle, today), today);

  if (bundle.logs.some((l) => l.value > 0)) codes.push('first_step');
  if (best >= 7) codes.push('week_streak');
  if (bundle.programs.some((p) => p.status === 'completed')) codes.push('program_complete');

  const perfect = bundle.programs.some((p) => {
    const tasks = bundle.tasks.filter((t) => t.programId === p.id);
    if (tasks.length === 0) return false;
    return programProgress(p, tasks, bundle.logs, { mode: 'final' }) >= 1;
  });
  if (perfect) codes.push('perfect_program');

  return codes;
}
