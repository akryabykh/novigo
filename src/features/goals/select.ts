// Selectors over the workspace (goals + logs).
import type { Goal, Timeframe } from '../../core/domain';
import type { Workspace } from '../queries';

export function goalsByTimeframe(ws: Workspace, tf: Timeframe): Goal[] {
  return ws.goals.filter((g) => g.timeframe === tf);
}

export function hasAnyGoals(ws: Workspace): boolean {
  return ws.goals.length > 0;
}
