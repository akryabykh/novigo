// ============================================================
// core/logic — платформо-независимое ядро (web + iOS + Android).
//
// Модель: КАЛЕНДАРНАЯ. Цели — повторяющиеся шаблоны по горизонтам
// (день/неделя/месяц). Прогресс считается по календарным периодам выбранной
// даты: день = сама дата, неделя = Пн–Вс этой даты, месяц = календарный месяц.
//
// Кольца вложенные (математика НЕ меняется — только привязка к календарю):
//   • День   = дневные цели за выбранный день (100%).
//   • Неделя = 60% (как шли дневные цели на этой неделе) + 40% (недельные цели по весам).
//   • Месяц  = 80% (среднее результатов недель месяца) + 20% (месячные цели по весам).
// ============================================================

export type Timeframe = 'day' | 'week' | 'month';
export const TIMEFRAMES: Timeframe[] = ['day', 'week', 'month'];

export const WEEK_DAYS = 7;

// Доли вложенных колец:
//   Неделя = 60% дни + 40% недельные цели
//   Месяц  = 80% недели + 20% месячные цели
export const WEEK_DAY_WEIGHT = 0.6;
export const WEEK_OWN_WEIGHT = 0.4;
export const MONTH_WEEKS_WEIGHT = 0.8;
export const MONTH_OWN_WEIGHT = 0.2;

export interface Goal {
  id: string;
  userId: string;
  title: string;
  timeframe: Timeframe;
  target: number; // цель за период своего горизонта
  weight: number; // вес внутри своего горизонта, 0..100
  startDate: string; // 'YYYY-MM-DD' — действует с этой даты (не задним числом)
  endDate: string | null; // 'YYYY-MM-DD' включительно, либо null = навсегда
}

export interface DailyLog {
  goalId: string;
  date: string; // 'YYYY-MM-DD'
  value: number;
}

// ---------- УТИЛИТЫ ДАТ (UTC) ----------
const MS_DAY = 86_400_000;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const pad = (n: number): string => String(n).padStart(2, '0');

export function todayISO(d: Date = new Date()): string {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
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
export function enumerateDates(start: string, endInclusive: string): string[] {
  const out: string[] = [];
  const n = daysBetween(start, endInclusive);
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

// ---------- КАЛЕНДАРНЫЕ ГРАНИЦЫ (неделя с ПОНЕДЕЛЬНИКА) ----------
/** Номер дня недели, Пн=0 .. Вс=6. */
export function weekdayMon0(d: string): number {
  return (new Date(parse(d)).getUTCDay() + 6) % 7;
}
export function startOfWeek(d: string): string {
  return addDays(d, -weekdayMon0(d));
}
export function endOfWeek(d: string): string {
  return addDays(startOfWeek(d), WEEK_DAYS - 1);
}
export function startOfMonth(d: string): string {
  const [y, m] = d.split('-');
  return `${y}-${m}-01`;
}
export function endOfMonth(d: string): string {
  const [y, m] = d.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 следующего месяца = последний день текущего
  return `${y}-${pad(m)}-${pad(last)}`;
}
/** Начала недель (понедельники), пересекающих календарный месяц даты d. */
export function weeksOfMonth(d: string): string[] {
  const last = endOfMonth(d);
  const out: string[] = [];
  let w = startOfWeek(startOfMonth(d));
  while (w <= last) {
    out.push(w);
    w = addDays(w, WEEK_DAYS);
  }
  return out;
}
/** Границы периода горизонта относительно опорной даты. */
export function periodRange(tf: Timeframe, refDate: string): { start: string; end: string } {
  if (tf === 'day') return { start: refDate, end: refDate };
  if (tf === 'week') return { start: startOfWeek(refDate), end: endOfWeek(refDate) };
  return { start: startOfMonth(refDate), end: endOfMonth(refDate) };
}

// ---------- ПЕРИОД ДЕЙСТВИЯ ЦЕЛИ ----------
/** Действует ли цель в конкретный день. */
export function isActiveOn(goal: Goal, date: string): boolean {
  return date >= goal.startDate && (goal.endDate == null || date <= goal.endDate);
}
/** Пересекается ли период действия цели с окном [start..end]. */
function overlaps(goal: Goal, start: string, end: string): boolean {
  return goal.startDate <= end && (goal.endDate == null || goal.endDate >= start);
}
/** Цели горизонта tf, чей период действия пересекает период даты refDate. */
export function goalsForScope(goals: Goal[], tf: Timeframe, refDate: string): Goal[] {
  const { start, end } = periodRange(tf, refDate);
  return goals.filter((g) => g.timeframe === tf && overlaps(g, start, end));
}

// ---------- СУММЫ ----------
function sumInRange(goalId: string, logs: DailyLog[], start: string, end: string): number {
  let s = 0;
  for (const l of logs) if (l.goalId === goalId && l.date >= start && l.date <= end) s += l.value;
  return s;
}

// ---------- ВЗВЕШЕННЫЙ ПРОГРЕСС ГРУППЫ ----------
function weighted(goals: Goal[], fn: (g: Goal) => number): number | null {
  if (goals.length === 0) return null;
  const wsum = goals.reduce((s, g) => s + g.weight, 0) || 1;
  return goals.reduce((acc, g) => acc + fn(g) * (g.weight / wsum), 0);
}
/**
 * Взвешенная связка двух частей с ФИКСИРОВАННЫМИ долями: отсутствующая часть
 * считается за 0 (не перенормируется). Так дневная половина недели ограничена
 * 60%, а недельная половина месяца — 80%.
 */
function blend(a: number | null, wa: number, b: number | null, wb: number): number | null {
  if (a == null && b == null) return null;
  return wa * (a ?? 0) + wb * (b ?? 0);
}

const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

// ---------- ПРОГРЕСС ПО ГОРИЗОНТАМ (учитывая период действия цели) ----------
/** Дневные цели, ДЕЙСТВУЮЩИЕ в этот день, 0..1; null если таких нет. */
export function dayGoalsOn(goals: Goal[], logs: DailyLog[], date: string): number | null {
  const active = goals.filter((g) => g.timeframe === 'day' && isActiveOn(g, date));
  return weighted(active, (g) => clamp01(sumInRange(g.id, logs, date, date) / g.target));
}

/** Недельные цели, действующие в неделе [wStart..wEnd], 0..1; null если их нет. */
function weekGoalsProgress(goals: Goal[], logs: DailyLog[], wStart: string, wEnd: string): number | null {
  const active = goals.filter((g) => g.timeframe === 'week' && overlaps(g, wStart, wEnd));
  return weighted(active, (g) => clamp01(sumInRange(g.id, logs, wStart, wEnd) / g.target));
}

/** Месячные цели, действующие в месяце [mStart..mEnd], 0..1; null если их нет. */
function monthGoalsProgress(goals: Goal[], logs: DailyLog[], mStart: string, mEnd: string): number | null {
  const active = goals.filter((g) => g.timeframe === 'month' && overlaps(g, mStart, mEnd));
  return weighted(active, (g) => clamp01(sumInRange(g.id, logs, mStart, mEnd) / g.target));
}

/**
 * Кольцо недели (начало weekStart, Пн): 60% дневные + 40% недельные.
 * Дневная часть — среднее дневных колец ПО ДНЯМ, где реально есть дневные цели
 * (динамический знаменатель): если цели активны только 4 дня из 7 — знаменатель 4.
 */
export function weekRingFor(goals: Goal[], logs: DailyLog[], weekStart: string): number | null {
  const wEnd = addDays(weekStart, WEEK_DAYS - 1);
  const dayRings = enumerateDates(weekStart, wEnd)
    .map((d) => dayGoalsOn(goals, logs, d))
    .filter((r): r is number => r != null);
  const dayPart = dayRings.length ? avg(dayRings) : null;
  const weekPart = weekGoalsProgress(goals, logs, weekStart, wEnd);
  return blend(dayPart, WEEK_DAY_WEIGHT, weekPart, WEEK_OWN_WEIGHT);
}

export interface Rings {
  day: number;
  week: number;
  month: number;
}

/** Три вложенных кольца для календарной даты refDate. */
export function computeRings(goals: Goal[], logs: DailyLog[], refDate: string = todayISO()): Rings {
  const day = dayGoalsOn(goals, logs, refDate) ?? 0;

  const week = weekRingFor(goals, logs, startOfWeek(refDate)) ?? 0;

  // Месяц завязан на НЕДЕЛИ (80%) + месячные цели (20%). Знаменатель — динамический:
  // среднее по неделям месяца, где есть хоть какие-то дневные/недельные цели.
  const weekRings = weeksOfMonth(refDate)
    .map((w) => weekRingFor(goals, logs, w))
    .filter((r): r is number => r != null);
  const weeksPart = weekRings.length ? avg(weekRings) : null;
  const monthPart = monthGoalsProgress(goals, logs, startOfMonth(refDate), endOfMonth(refDate));
  const month = blend(weeksPart, MONTH_WEEKS_WEIGHT, monthPart, MONTH_OWN_WEIGHT) ?? 0;

  return { day, week, month };
}

// ---------- ПРОГРЕСС ОТДЕЛЬНОЙ ЦЕЛИ (для плашки + / −) ----------
/** Накоплено по цели за её период относительно опорной даты. */
export function goalCurrent(goal: Goal, logs: DailyLog[], refDate: string): number {
  const { start, end } = periodRange(goal.timeframe, refDate);
  return sumInRange(goal.id, logs, start, end);
}

/** Значение цели за конкретную дату (то, что редактирует степпер). */
export function goalOnDate(goal: Goal, logs: DailyLog[], date: string): number {
  return sumInRange(goal.id, logs, date, date);
}

export function goalCardProgress(goal: Goal, logs: DailyLog[], refDate: string): number {
  return goal.target > 0 ? clamp01(goalCurrent(goal, logs, refDate) / goal.target) : 0;
}

/** Максимум на выбранную дату без перевыполнения периода. */
export function goalMaxOnDate(goal: Goal, logs: DailyLog[], refDate: string): number {
  const others = goalCurrent(goal, logs, refDate) - goalOnDate(goal, logs, refDate);
  return Math.max(0, goal.target - others);
}

export function validateWeights(
  goals: Pick<Goal, 'weight'>[],
): { sum: number; remaining: number; ok: boolean } {
  const sum = goals.reduce((s, g) => s + g.weight, 0);
  return { sum, remaining: 100 - sum, ok: Math.abs(sum - 100) < 1e-6 };
}

// ============================================================
// СТРИКИ — день активен, если дневное кольцо за тот день ≥ порога.
// ============================================================
export function computeStreaks(
  activeDates: string[],
  today: string = todayISO(),
): { current: number; best: number } {
  const set = new Set(activeDates);
  const sorted = [...set].sort();
  let best = 0,
    run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  let cursor = set.has(today) ? today : addDays(today, -1);
  if (!set.has(cursor)) return { current: 0, best };
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, best };
}

// ============================================================
// XP / УРОВНИ
// ============================================================
export const XP = {
  PER_GOAL: 10, // цель закрыта за период
  PERFECT_DAY: 5, // 100% дневного кольца
} as const;

export function totalXpForLevel(level: number): number {
  return level <= 1 ? 0 : Math.round(100 * Math.pow(level - 1, 1.5));
}

export interface LevelInfo {
  level: number;
  into: number;
  toNext: number;
  progress: number;
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  while (totalXpForLevel(level + 1) <= xp) level++;
  const base = totalXpForLevel(level);
  const next = totalXpForLevel(level + 1);
  const span = next - base;
  return { level, into: xp - base, toNext: span, progress: span ? (xp - base) / span : 0 };
}
