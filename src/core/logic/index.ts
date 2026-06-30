// ============================================================
// core/logic — платформо-независимое ядро (web + iOS + Android).
//
// Модель: СЕССИЯ ЦЕЛЕЙ. Жмёшь + → создаёшь цели на день/неделю/месяц,
// отсчёт идёт ОТ ЭТОГО МОМЕНТА (не календарь, не регистрация).
// Сессия = 4 недели = 28 дней.
//
// Кольца связаны 50/50:
//   • День   = дневные цели за сегодня (100%).
//   • Неделя = 50% (как шли дневные цели на этой неделе) + 50% (недельные цели по весам).
//   • Месяц  = 50% (среднее результатов недель) + 50% (месячные цели по весам).
// ============================================================

export type Timeframe = 'day' | 'week' | 'month';
export const TIMEFRAMES: Timeframe[] = ['day', 'week', 'month'];

export const WEEK_DAYS = 7;
export const WEEKS_IN_SESSION = 4;
export const SESSION_DAYS = WEEK_DAYS * WEEKS_IN_SESSION; // 28

export interface Goal {
  id: string;
  sessionId: string;
  title: string;
  timeframe: Timeframe;
  target: number; // цель за период своего горизонта
  weight: number; // вес внутри своего горизонта, 0..100
}

export interface DailyLog {
  goalId: string;
  date: string; // 'YYYY-MM-DD'
  value: number;
}

export interface GoalSession {
  id: string;
  userId: string;
  startDate: string; // 'YYYY-MM-DD' — начало отсчёта
}

// ---------- УТИЛИТЫ ДАТ (UTC) ----------
const MS_DAY = 86_400_000;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

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

// ---------- ГРАНИЦЫ СЕССИИ ----------
export function sessionEnd(start: string): string {
  return addDays(start, SESSION_DAYS - 1);
}
/** Опорная дата, ограниченная рамками сессии [start..end]. */
export function clampAsOf(start: string, today: string): string {
  const end = sessionEnd(start);
  if (today < start) return start;
  if (today > end) return end;
  return today;
}
/** Индекс дня сессии 0..27. */
export function dayIndex(start: string, asOf: string): number {
  return Math.max(0, Math.min(SESSION_DAYS - 1, daysBetween(start, asOf)));
}
/** Индекс текущей недели сессии 0..3. */
export function currentWeekIndex(start: string, asOf: string): number {
  return Math.min(WEEKS_IN_SESSION - 1, Math.floor(dayIndex(start, asOf) / WEEK_DAYS));
}
export function weekRange(start: string, weekIndex: number): { start: string; end: string } {
  const s = addDays(start, weekIndex * WEEK_DAYS);
  return { start: s, end: addDays(s, WEEK_DAYS - 1) };
}
export function daysRemaining(start: string, today: string = todayISO()): number {
  return Math.max(0, daysBetween(today, sessionEnd(start)));
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
function only(goals: Goal[], tf: Timeframe): Goal[] {
  return goals.filter((g) => g.timeframe === tf);
}
/** Среднее непустых частей; null если все пусты. */
function avg(parts: (number | null)[]): number | null {
  const present = parts.filter((x): x is number => x != null);
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}
/** Связка двух частей 50/50; пустая часть выпадает, оставшаяся берёт всё. */
function blendHalf(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return 0.5 * a + 0.5 * b;
}

// ---------- ПРОГРЕСС ПО ГОРИЗОНТАМ ----------
/** Дневные цели за конкретный день, 0..1; null если дневных целей нет. */
export function dayGoalsOn(goals: Goal[], logs: DailyLog[], date: string): number | null {
  return weighted(only(goals, 'day'), (g) => clamp01(sumInRange(g.id, logs, date, date) / g.target));
}

/** Недельные цели за окно недели до asOf, 0..1; null если их нет. */
function weekGoalsProgress(
  goals: Goal[],
  logs: DailyLog[],
  wStart: string,
  asOf: string,
): number | null {
  return weighted(only(goals, 'week'), (g) => clamp01(sumInRange(g.id, logs, wStart, asOf) / g.target));
}

/** Месячные цели за сессию до asOf, 0..1; null если их нет. */
function monthGoalsProgress(
  goals: Goal[],
  logs: DailyLog[],
  start: string,
  asOf: string,
): number | null {
  return weighted(only(goals, 'month'), (g) => clamp01(sumInRange(g.id, logs, start, asOf) / g.target));
}

/** Кольцо недели weekIndex: 50% дневные на этой неделе + 50% недельные. null если неделя не началась. */
export function weekRingFor(
  session: GoalSession,
  goals: Goal[],
  logs: DailyLog[],
  weekIndex: number,
  today: string,
): number | null {
  const asOf = clampAsOf(session.startDate, today);
  const { start: wStart, end: wEnd } = weekRange(session.startDate, weekIndex);
  if (asOf < wStart) return null; // ещё не началась
  const end = asOf < wEnd ? asOf : wEnd;
  const dayPart = avg(enumerateDates(wStart, end).map((d) => dayGoalsOn(goals, logs, d)));
  const weekPart = weekGoalsProgress(goals, logs, wStart, end);
  return blendHalf(dayPart, weekPart);
}

export interface Rings {
  day: number;
  week: number;
  month: number;
}

export function computeRings(
  session: GoalSession,
  goals: Goal[],
  logs: DailyLog[],
  today: string = todayISO(),
): Rings {
  const asOf = clampAsOf(session.startDate, today);

  const day = dayGoalsOn(goals, logs, asOf) ?? 0;

  const wi = currentWeekIndex(session.startDate, asOf);
  const week = weekRingFor(session, goals, logs, wi, today) ?? 0;

  const weekRings: (number | null)[] = [];
  for (let i = 0; i <= wi; i++) weekRings.push(weekRingFor(session, goals, logs, i, today));
  const weeksPart = avg(weekRings);
  const monthPart = monthGoalsProgress(goals, logs, session.startDate, asOf);
  const month = blendHalf(weeksPart, monthPart) ?? 0;

  return { day, week, month };
}

// ---------- ПРОГРЕСС ОТДЕЛЬНОЙ ЦЕЛИ (для плашки + / −) ----------
/** Начало текущего периода цели в рамках сессии. */
export function goalPeriodStart(session: GoalSession, goal: Goal, today: string): string {
  const asOf = clampAsOf(session.startDate, today);
  if (goal.timeframe === 'day') return asOf;
  if (goal.timeframe === 'week') {
    return weekRange(session.startDate, currentWeekIndex(session.startDate, asOf)).start;
  }
  return session.startDate;
}

/** Накоплено по цели за её текущий период. */
export function goalCurrent(session: GoalSession, goal: Goal, logs: DailyLog[], today: string): number {
  const asOf = clampAsOf(session.startDate, today);
  return sumInRange(goal.id, logs, goalPeriodStart(session, goal, today), asOf);
}

export function goalToday(goal: Goal, logs: DailyLog[], today: string): number {
  return sumInRange(goal.id, logs, today, today);
}

export function goalCardProgress(
  session: GoalSession,
  goal: Goal,
  logs: DailyLog[],
  today: string,
): number {
  return goal.target > 0 ? clamp01(goalCurrent(session, goal, logs, today) / goal.target) : 0;
}

/** Максимум на СЕГОДНЯ без перевыполнения периода. */
export function goalMaxToday(
  session: GoalSession,
  goal: Goal,
  logs: DailyLog[],
  today: string,
): number {
  const others = goalCurrent(session, goal, logs, today) - goalToday(goal, logs, today);
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
