// Pure workspace-cache transforms for optimistic logging. No React / RN imports
// (types only) so this stays trivially unit-testable.
import type { DailyLog } from '../../core/domain';
import type { Workspace } from '../queries';

export interface LogInput {
  goalId: string;
  date: string;
  value: number;
}

/** Apply one optimistic value to a workspace snapshot (value<=0 removes the log). */
export function applyLog(ws: Workspace, v: LogInput): Workspace {
  const rest = ws.logs.filter((l) => !(l.goalId === v.goalId && l.date === v.date));
  const logs: DailyLog[] = v.value > 0 ? [...rest, { goalId: v.goalId, date: v.date, value: v.value }] : rest;
  return { ...ws, logs };
}
