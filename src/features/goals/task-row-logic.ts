// Pure logic behind TaskRow — extracted so it's unit-testable without rendering.
import type { DailyLog, Goal } from '../../core/domain';
import { goalCurrent, goalMaxOnDate, goalOnDate } from '../../core/logic';

export function isTaskDone(task: Goal, logs: DailyLog[], date: string): boolean {
  return goalCurrent(task, logs, date) >= task.target;
}

/** Value to log when toggling: check → fill the remainder, uncheck → 0. */
export function taskToggleValue(task: Goal, logs: DailyLog[], date: string): number {
  return isTaskDone(task, logs, date) ? 0 : goalOnDate(task, logs, date) + goalMaxOnDate(task, logs, date);
}

/**
 * Handle a delete tap. The trash button sits INSIDE the row's toggle Pressable,
 * so we stop the press from bubbling — deleting must never also toggle the task.
 */
export function handleDeletePress(e: { stopPropagation?: () => void }, onDelete?: () => void): void {
  e.stopPropagation?.();
  onDelete?.();
}
