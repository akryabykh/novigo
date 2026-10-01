import type { Timeframe } from '../../core/domain';
import { addDays, periodRange, startOfMonth, startOfWeek } from '../../core/logic';
import { addMonths } from '../calendar/format';

export function taskMoveDates(to: Timeframe, selectedDate: string) {
  const startDate = to === 'day' ? selectedDate : to === 'week' ? startOfWeek(selectedDate) : startOfMonth(selectedDate);
  return { startDate, endDate: periodRange(to, startDate).end };
}

export function nextTaskPeriod(from: Timeframe, refDate: string) {
  const date = from === 'day' ? addDays(refDate, 1)
    : from === 'week' ? addDays(startOfWeek(refDate), 7) : addMonths(startOfMonth(refDate), 1);
  return { to: from, ...taskMoveDates(from, date) };
}
