// ============================================================
// Gamification engine — derives XP / level / streaks / achievements
// from raw data. Pure + idempotent: always recomputed from scratch so
// re-running never double-counts. Built on core/logic.
//
// Streaks are evaluated PER PROGRAM: a date counts as active if ANY active
// program met its own daily-task threshold that day (not a global average).
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

function covers(p: Program, date: string): boolean {
  return p.status !== 'archived' && p.startDate <= date && date <= p.endDate;
}

/**
 * Daily completion (0..1) of a SINGLE program on `date`, averaged over its
 * daily tasks. Returns null if the program has no daily tasks covering the date.
 */
export function programDayProgress(
  programId: string,
  date: string,
  { programs, tasks, logs }: Bundle,
  idx: Map<string, number> = logIndex(logs),
): number | null {
  const program = programs.find((p) => p.id === programId);
  if (!program || !covers(program, date)) return null;
  const dailyTasks = tasks.filter((t) => t.goalType === 'daily' && t.programId === programId);
  if (dailyTasks.length === 0) return null;
  const sum = dailyTasks.reduce(
    (s, t) => s + clamp01((idx.get(`${t.id}|${date}`) ?? 0) / t.target),
    0,
  );
  return sum / dailyTasks.length;
}

/** Best (max) per-program daily completion on `date` — drives streak + heatmap. */
export function bestDayProgress(date: string, bundle: Bundle): number {
  const idx = logIndex(bundle.logs);
  let best = 0;
  for (const p of bundle.programs) {
    const v = programDayProgress(p.id, date, bundle, idx);
    if (v != null && v > best) best = v;
  }
  return best;
}

/** Dates (<= today) where at least one program met its own active-day threshold. */
export function activeDates(bundle: Bundle, today: string = todayISO()): string[] {
  const dates = [...new Set(bundle.logs.map((l) => l.date))].filter((d) => d <= today);
  return dates.filter((d) => bestDayProgress(d, bundle) >= STREAK_ACTIVE_THRESHOLD);
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

  // +5 per perfect program-day (all of a program's daily tasks at 100%)
  const loggedDates = [...new Set(bundle.logs.map((l) => l.date))].filter((d) => d <= today);
  for (const p of programs) {
    for (const d of loggedDates) {
      const v = programDayProgress(p.id, d, bundle, idx);
      if (v != null && v >= 1) xp += XP.PERFECT_DAY;
    }
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
