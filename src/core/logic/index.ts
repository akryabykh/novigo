// ============================================================
// core/logic — платформо-независимое ядро (web + iOS + Android).
// Чистые функции, без зависимостей. Покрываются юнит-тестами.
// ============================================================

// ---------- ДОМЕННЫЕ ТИПЫ (core/domain) ----------
// Периоды day-based: 7 / 14 / 30 дней (end_date считает триггер БД).
export type Period = '7d' | '14d' | '30d';
export type GoalType = 'daily' | 'period';
export type ProgramStatus = 'active' | 'completed' | 'archived';

export interface Task {
  id: string;
  programId: string;
  title: string;
  goalType: GoalType;
  target: number;      // daily: цель/день; period: цель/период
  unit?: string;       // отжимания / страницы / минуты
  weight: number;      // вес в программе, проценты 0..100
}

export interface DailyLog {
  taskId: string;
  date: string;        // 'YYYY-MM-DD'
  value: number;       // факт за день (частичное допускается)
}

export interface Program {
  id: string;
  userId: string;
  title: string;
  period: Period;
  startDate: string;   // 'YYYY-MM-DD'
  endDate: string;     // 'YYYY-MM-DD' (включительно)
  status: ProgramStatus;
}

// ---------- УТИЛИТЫ ДАТ (UTC, без TZ-багов) ----------
const MS_DAY = 86_400_000;

export function todayISO(d: Date = new Date()): string {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString().slice(0, 10);
}
function parse(d: string): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b) - parse(a)) / MS_DAY);
}
export function addDays(d: string, n: number): string {
  return new Date(parse(d) + n * MS_DAY).toISOString().slice(0, 10);
}
/** Все дни периода включительно: [start..end] */
export function enumerateDates(start: string, endInclusive: string): string[] {
  const out: string[] = [];
  const n = daysBetween(start, endInclusive);
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

// ============================================================
// ПРОГРЕСС
// ============================================================

export interface ProgressOpts {
  /** опорная дата (по умолчанию — сегодня) */
  asOf?: string;
  /** 'sofar' — среднее по прошедшим дням (для живого UI); 'final' — по всем дням периода */
  mode?: 'sofar' | 'final';
}

/** Прогресс одной задачи, 0..1 */
export function taskProgress(
  task: Task,
  program: Program,
  logs: DailyLog[],
  opts: ProgressOpts = {},
): number {
  const taskLogs = logs.filter(l => l.taskId === task.id);

  if (task.goalType === 'period') {
    const total = taskLogs.reduce((s, l) => s + l.value, 0);
    return clamp01(total / task.target);
  }

  // daily
  const asOf = opts.asOf ?? todayISO();
  const mode = opts.mode ?? 'sofar';
  const allDays = enumerateDates(program.startDate, program.endDate);
  const days = mode === 'final' ? allDays : allDays.filter(d => d <= asOf);
  if (days.length === 0) return 0;

  const byDate = new Map(taskLogs.map(l => [l.date, l.value]));
  const sum = days.reduce(
    (s, d) => s + clamp01((byDate.get(d) ?? 0) / task.target),
    0,
  );
  return sum / days.length;
}

/** Взвешенный прогресс программы, 0..1. Устойчив, если сумма весов ≠ 100. */
export function programProgress(
  program: Program,
  tasks: Task[],
  logs: DailyLog[],
  opts: ProgressOpts = {},
): number {
  if (tasks.length === 0) return 0;
  const wsum = tasks.reduce((s, t) => s + t.weight, 0) || 1;
  return tasks.reduce(
    (acc, t) => acc + taskProgress(t, program, logs, opts) * (t.weight / wsum),
    0,
  );
}

/** Проверка суммы весов = 100% (для UI создания/редактирования программы) */
export function validateWeights(
  tasks: Array<Pick<Task, 'weight'>>,
): { sum: number; remaining: number; ok: boolean } {
  const sum = tasks.reduce((s, t) => s + t.weight, 0);
  return { sum, remaining: 100 - sum, ok: Math.abs(sum - 100) < 1e-6 };
}

/** Дней до завершения программы (>= 0) */
export function daysRemaining(program: Program, today: string = todayISO()): number {
  return Math.max(0, daysBetween(today, program.endDate));
}

// ============================================================
// СТРИКИ
// activeDates — дни, в которые пользователь выполнил дневной минимум
// (решает вызывающий код: напр. дневной прогресс >= порога).
// ============================================================
export function computeStreaks(
  activeDates: string[],
  today: string = todayISO(),
): { current: number; best: number } {
  const set = new Set(activeDates);

  // лучший
  const sorted = [...set].sort();
  let best = 0, run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }

  // текущий — серия, заканчивающаяся сегодня или вчера
  let cursor = set.has(today) ? today : addDays(today, -1);
  if (!set.has(cursor)) return { current: 0, best };
  let current = 0;
  while (set.has(cursor)) { current++; cursor = addDays(cursor, -1); }
  return { current, best };
}

// ============================================================
// XP / УРОВНИ  (level N достигается при totalXpForLevel(N) опыта)
// ============================================================
export const XP = {
  PER_TASK: 10,          // за выполненную задачу
  PERFECT_DAY: 5,        // бонус за 100% всех задач дня
  PROGRAM_COMPLETE: 100, // за завершённую программу
} as const;

/** Суммарный XP, нужный чтобы достичь уровня (level 1 = 0) */
export function totalXpForLevel(level: number): number {
  return level <= 1 ? 0 : Math.round(100 * Math.pow(level - 1, 1.5));
}

export interface LevelInfo {
  level: number;
  into: number;      // XP внутри текущего уровня
  toNext: number;    // XP-«ширина» текущего уровня
  progress: number;  // 0..1 до следующего уровня
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  while (totalXpForLevel(level + 1) <= xp) level++;
  const base = totalXpForLevel(level);
  const next = totalXpForLevel(level + 1);
  const span = next - base;
  return { level, into: xp - base, toNext: span, progress: span ? (xp - base) / span : 0 };
}
