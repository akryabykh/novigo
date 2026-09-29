// Pure logic behind TaskRow — extracted so it's unit-testable without rendering.
import type { DailyLog, Goal } from '../../core/domain';
import { goalCurrent, goalMaxOnDate, isActiveOn, periodRange } from '../../core/logic';
import type { LogInput } from '../calendar/log-cache';

export function isTaskDone(task: Goal, logs: DailyLog[], date: string): boolean {
  return goalCurrent(task, logs, date) >= task.target;
}

/** Value to log when toggling: check → fill the remainder, uncheck → 0. */
export function taskToggleValue(task: Goal, logs: DailyLog[], date: string): number {
  return isTaskDone(task, logs, date) ? 0 : goalMaxOnDate(task, logs, date);
}

/** A checkbox represents its entire period, even when checked on another day. */
export function taskLogChanges(task: Goal, logs: DailyLog[], date: string, done?: boolean): LogInput[] {
  const nextDone = done ?? !isTaskDone(task, logs, date);
  if (nextDone) return [{ goalId: task.id, date, value: goalMaxOnDate(task, logs, date) }];
  const { start, end } = periodRange(task.timeframe, date);
  return logs
    .filter((l) => l.goalId === task.id && l.value > 0 && l.date >= start && l.date <= end && isActiveOn(task, l.date))
    .map((l) => ({ goalId: task.id, date: l.date, value: 0 }));
}

/**
 * Handle a delete tap. The trash button sits INSIDE the row's toggle Pressable,
 * so we stop the press from bubbling — deleting must never also toggle the task.
 */
export function handleDeletePress(e: { stopPropagation?: () => void }, onDelete?: () => void): void {
  e.stopPropagation?.();
  onDelete?.();
}
