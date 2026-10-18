import type { Timeframe } from '../../core/domain';
import { periodRange } from '../../core/logic';
import type { FamilyOperation, FamilySnapshot, FamilyTask } from './family-data';

export function familyTasksForPeriod(tasks: FamilyTask[], timeframe: Timeframe, date: string): FamilyTask[] {
  const { start } = periodRange(timeframe, date);
  return tasks.filter((task) => task.timeframe === timeframe && task.periodStart === start);
}

export function familyOpenCounts(tasks: FamilyTask[], date: string): Record<Timeframe, number> {
  const count = (timeframe: Timeframe) => familyTasksForPeriod(tasks, timeframe, date).filter((task) => !task.done).length;
  return { day: count('day'), week: count('week'), month: count('month') };
}

export function familyRings(tasks: FamilyTask[], date: string): Record<Timeframe, number> {
  const progress = (timeframe: Timeframe) => {
    const selected = familyTasksForPeriod(tasks, timeframe, date);
    return selected.length ? selected.filter((task) => task.done).length / selected.length : 0;
  };
  return { day: progress('day'), week: progress('week'), month: progress('month') };
}

export function applyFamilyOperation(snapshot: FamilySnapshot, op: FamilyOperation, uid: string): FamilySnapshot {
  if (!snapshot.family || snapshot.family.id !== op.familyId) return snapshot;
  if (op.action === 'delete') return { ...snapshot, tasks: snapshot.tasks.filter((task) => task.id !== op.taskId) };
  if (op.action === 'toggle') return {
    ...snapshot,
    tasks: snapshot.tasks.map((task) => task.id === op.taskId ? { ...task, done: !!op.done } : task),
  };
  if (snapshot.tasks.some((task) => task.id === op.taskId)) return snapshot;
  return { ...snapshot, tasks: [...snapshot.tasks, {
    id: op.taskId, familyId: op.familyId, title: op.title ?? '', timeframe: op.timeframe!,
    periodStart: op.periodStart!, done: false, createdBy: uid,
  }] };
}

export function overlayFamily(snapshot: FamilySnapshot, operations: FamilyOperation[], uid: string): FamilySnapshot {
  return operations.reduce((current, op) => applyFamilyOperation(current, op, uid), snapshot);
}
