// Small selectors over the aggregate workspace.
import type { DailyLog, Program, Task } from '../../core/domain';
import { programProgress } from '../../core/logic';
import type { Workspace } from '../queries';

export interface ProgramSlice {
  program: Program;
  tasks: Task[];
  logs: DailyLog[];
}

export function sliceProgram(ws: Workspace, programId: string): ProgramSlice | null {
  const program = ws.programs.find((p) => p.id === programId);
  if (!program) return null;
  const tasks = ws.tasks.filter((t) => t.programId === programId);
  const taskIds = new Set(tasks.map((t) => t.id));
  const logs = ws.logs.filter((l) => taskIds.has(l.taskId));
  return { program, tasks, logs };
}

export function activeSlices(ws: Workspace): ProgramSlice[] {
  return ws.programs
    .filter((p) => p.status === 'active')
    .map((p) => sliceProgram(ws, p.id)!)
    .filter(Boolean);
}

/** Mean progress across the given slices (0..1). */
export function overallProgress(slices: ProgramSlice[]): number {
  if (slices.length === 0) return 0;
  const sum = slices.reduce((s, sl) => s + programProgress(sl.program, sl.tasks, sl.logs), 0);
  return sum / slices.length;
}
