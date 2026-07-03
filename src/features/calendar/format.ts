// Pure calendar formatting shared by the Goals and Tasks screens.
import type { Timeframe } from '../../core/domain';
import { addDays, endOfWeek, startOfWeek } from '../../core/logic';

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const pad = (n: number): string => String(n).padStart(2, '0');

export const dayNum = (d: string): number => Number(d.split('-')[2]);
export const monthOf = (d: string): number => Number(d.split('-')[1]) - 1;

/** Shift an ISO date by n calendar months, clamping the day to the target month length. */
export function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  const y2 = dt.getUTCFullYear();
  const m2 = dt.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
  return `${y2}-${pad(m2)}-${pad(Math.min(day, last))}`;
}

/** Human title for the period around date `d` at the given scope. */
export function periodTitle(scope: Timeframe, d: string, today: string): string {
  if (scope === 'day') {
    if (d === today) return 'Сегодня';
    if (d === addDays(today, -1)) return 'Вчера';
    if (d === addDays(today, 1)) return 'Завтра';
    return `${dayNum(d)} ${MONTHS_GEN[monthOf(d)]}`;
  }
  if (scope === 'week') {
    const s = startOfWeek(d);
    const e = endOfWeek(d);
    return monthOf(s) === monthOf(e)
      ? `${dayNum(s)}–${dayNum(e)} ${MONTHS_GEN[monthOf(e)]}`
      : `${dayNum(s)} ${MONTHS_GEN[monthOf(s)]} – ${dayNum(e)} ${MONTHS_GEN[monthOf(e)]}`;
  }
  const y = Number(d.split('-')[0]);
  const cy = Number(today.split('-')[0]);
  return y === cy ? MONTHS_NOM[monthOf(d)] : `${MONTHS_NOM[monthOf(d)]} ${y}`;
}
