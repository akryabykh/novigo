import type { QueryClient } from '@tanstack/react-query';

import { listGoalsByUser, listLogsByGoals, supabase, type SaveHorizonInput } from '../../core/data';
import type { Goal, GoalKind, Timeframe } from '../../core/domain';
import { goalsForScope } from '../../core/logic';
import { qk } from '../../core/query';
import type { Workspace } from '../queries';
import { syncGamification } from '../gamification/sync';
import { readOffline, updateOffline, type OfflineOperation, type StoredLog } from './store';

const revisionKey = (kind: GoalKind, timeframe: Timeframe) => `${kind}:${timeframe}`;
const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;
const active = new Map<string, Promise<void>>();

function operationId(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('На устройстве недоступен безопасный генератор ID');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  return [...bytes].map((b, i) => `${[4, 6, 8, 10].includes(i) ? '-' : ''}${b.toString(16).padStart(2, '0')}`).join('');
}

export function applyOperation(workspace: Workspace, op: OfflineOperation): Workspace {
  if (op.type === 'logs') {
    const logs = [...workspace.logs];
    for (const change of op.changes) {
      const index = logs.findIndex((x) => x.goalId === change.goalId && x.date === change.date);
      if (index < 0) logs.push({ goalId: change.goalId, date: change.date, value: change.value });
      else logs[index] = { ...logs[index], value: change.value };
    }
    return { ...workspace, logs };
  }
  if (op.type === 'move') return {
    ...workspace,
    goals: workspace.goals.map((g) => g.id === op.taskId
      ? { ...g, timeframe: op.to, startDate: op.startDate, endDate: op.endDate } : g),
    logs: workspace.logs.filter((log) => log.goalId !== op.taskId),
  };
  const deleted = new Set(op.input.deletes);
  const updates = new Map(op.input.updates.map((value) => [value.id, value]));
  const goals = workspace.goals.filter((g) => !deleted.has(g.id)).map((g) => ({ ...g, ...updates.get(g.id) }));
  for (const value of op.input.creates) {
    goals.push({ ...value, id: value.id!, userId: op.userId, kind: value.kind } as Goal);
  }
  return { ...workspace, goals, logs: workspace.logs.filter((log) => !deleted.has(log.goalId)) };
}

export function overlayOperations(workspace: Workspace, operations: OfflineOperation[]): Workspace {
  return operations.reduce(applyOperation, workspace);
}

export async function fetchRemoteWorkspace(uid: string): Promise<Workspace> {
  const readRevisions = async () => {
    const { data, error } = await supabase.from('horizon_revisions').select('kind,timeframe,revision').eq('user_id', uid);
    if (error) throw error;
    const revisions: Record<string, number> = {};
    for (const row of data ?? []) revisions[revisionKey(row.kind as GoalKind, row.timeframe as Timeframe)] = Number(row.revision);
    return revisions;
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await readRevisions();
    const goals = await listGoalsByUser(uid);
    const logs = await listLogsByGoals(goals.map((g) => g.id));
    const after = await readRevisions();
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    if ([...keys].every((key) => before[key] === after[key])) return { goals, logs, revisions: after };
  }
  throw new Error('Цели изменились во время загрузки. Повтори попытку.');
}

export async function loadOfflineWorkspace(uid: string, qc: QueryClient): Promise<Workspace> {
  const stored = await readOffline(uid);
  if (!isOnline() && stored.workspace) return overlayOperations(stored.workspace, stored.operations);
  try {
    if (stored.operations.length) await synchronize(uid, qc);
    const remote = await fetchRemoteWorkspace(uid);
    await updateOffline(uid, (record) => [{ ...record, workspace: remote, error: null }, undefined]);
    const latest = await readOffline(uid);
    return overlayOperations(remote, latest.operations);
  } catch (error) {
    if (stored.workspace) {
      await updateOffline(uid, (record) => [{ ...record,
        error: record.error ?? 'Нет соединения. Показаны данные на устройстве.',
      }, undefined]);
      const latest = await readOffline(uid);
      return overlayOperations(latest.workspace ?? stored.workspace, latest.operations);
    }
    throw error;
  }
}

export async function queueHorizon(
  uid: string, kind: GoalKind, timeframe: Timeframe, refDate: string, input: SaveHorizonInput, qc: QueryClient,
): Promise<void> {
  const stableInput = { ...input, creates: input.creates.map((g) => ({ ...g, id: g.id ?? operationId() })) };
  const id = operationId();
  const op = await updateOffline(uid, (record) => {
    const base = record.workspace ?? qc.getQueryData<Workspace>(qk.workspace(uid));
    if (!base) throw new Error('Сначала открой цели с интернетом');
    const value: OfflineOperation = {
      id, type: 'horizon', userId: uid, kind, timeframe, refDate,
      expectedRevision: base.revisions?.[revisionKey(kind, timeframe)] ?? 0,
      input: stableInput,
    };
    return [{ ...record, workspace: record.workspace ?? base, operations: [...record.operations, value], error: null }, value];
  });
  qc.setQueryData<Workspace>(qk.workspace(uid), (ws) => ws && applyOperation(ws, op));
  void synchronize(uid, qc);
}

export interface TaskMoveInput {
  taskId: string;
  from: Timeframe;
  to: Timeframe;
  startDate: string;
  endDate: string;
}

export async function queueTaskMove(uid: string, input: TaskMoveInput, qc: QueryClient): Promise<void> {
  const id = operationId();
  const op = await updateOffline(uid, (record) => {
    const base = record.workspace ?? qc.getQueryData<Workspace>(qk.workspace(uid));
    if (!base) throw new Error('Сначала открой задачи с интернетом');
    const task = overlayOperations(base, record.operations).goals.find((g) => g.id === input.taskId);
    if (!task || task.kind !== 'task' || task.timeframe !== input.from) throw new Error('Задача уже перемещена');
    const value: OfflineOperation = {
      id, type: 'move', ...input,
      expectedSourceRevision: base.revisions?.[revisionKey('task', input.from)] ?? 0,
      expectedDestinationRevision: base.revisions?.[revisionKey('task', input.to)] ?? 0,
    };
    return [{ ...record, workspace: record.workspace ?? base, operations: [...record.operations, value], error: null }, value];
  });
  qc.setQueryData<Workspace>(qk.workspace(uid), (ws) => ws && applyOperation(ws, op));
  void synchronize(uid, qc);
}

export async function queueLogs(uid: string, changes: StoredLog[], qc: QueryClient): Promise<void> {
  const id = operationId();
  const op = await updateOffline(uid, (record) => {
    const base = record.workspace ?? qc.getQueryData<Workspace>(qk.workspace(uid));
    if (!base) throw new Error('Сначала открой цели с интернетом');
    const value: OfflineOperation = { id, type: 'logs', changes };
    return [{ ...record, workspace: record.workspace ?? base, operations: [...record.operations, value], error: null }, value];
  });
  qc.setQueryData<Workspace>(qk.workspace(uid), (ws) => ws && applyOperation(ws, op));
  void synchronize(uid, qc);
}

async function send(op: OfflineOperation): Promise<number | { source: number; destination: number } | null> {
  if (op.type === 'logs') {
    const { error } = await supabase.rpc('apply_offline_logs', { p_operation_id: op.id, p_changes: op.changes });
    if (error) throw error;
    return null;
  }
  if (op.type === 'move') {
    const { data, error } = await supabase.rpc('apply_offline_task_move', {
      p_operation_id: op.id, p_task_id: op.taskId, p_from: op.from, p_to: op.to,
      p_start_date: op.startDate, p_end_date: op.endDate,
      p_expected_source_revision: op.expectedSourceRevision,
      p_expected_destination_revision: op.expectedDestinationRevision,
    });
    if (error) throw error;
    return { source: Number(data.source), destination: Number(data.destination) };
  }
  const { data, error } = await supabase.rpc('apply_offline_horizon', {
    p_operation_id: op.id, p_kind: op.kind, p_timeframe: op.timeframe,
    p_expected_revision: op.expectedRevision, p_updates: op.input.updates,
    p_creates: op.input.creates, p_deletes: op.input.deletes,
  });
  if (error) throw error;
  return Number(data);
}

export function synchronize(uid: string, qc: QueryClient): Promise<void> {
  if (!isOnline()) return Promise.resolve();
  if (active.has(uid)) return active.get(uid)!;
  const work = (async () => {
    let saved = false;
    while (true) {
      const state = await readOffline(uid);
      if (state.conflictId || !state.operations.length || !isOnline()) break;
      const op = state.operations[0];
      try {
        const revision = await send(op);
        await updateOffline(uid, (record) => {
          const next = record.operations.filter((x) => x.id !== op.id);
          const workspace = record.workspace && applyOperation(record.workspace, op);
          if (workspace && op.type === 'horizon' && typeof revision === 'number') {
            const key = revisionKey(op.kind, op.timeframe);
            workspace.revisions = { ...workspace.revisions, [key]: revision };
            // Following edits in this same horizon were made on top of this local edit.
            for (const item of next) if (item.type === 'horizon' && revisionKey(item.kind, item.timeframe) === key) item.expectedRevision = revision;
          }
          if (workspace && op.type === 'move' && revision && typeof revision !== 'number') {
            const sourceKey = revisionKey('task', op.from);
            const destinationKey = revisionKey('task', op.to);
            workspace.revisions = { ...workspace.revisions, [sourceKey]: revision.source, [destinationKey]: revision.destination };
            for (const item of next) {
              if (item.type === 'horizon' && item.kind === 'task') {
                if (item.timeframe === op.from) item.expectedRevision = revision.source;
                if (item.timeframe === op.to) item.expectedRevision = revision.destination;
              } else if (item.type === 'move') {
                if (item.from === op.from) item.expectedSourceRevision = revision.source;
                if (item.from === op.to) item.expectedSourceRevision = revision.destination;
                if (item.to === op.from) item.expectedDestinationRevision = revision.source;
                if (item.to === op.to) item.expectedDestinationRevision = revision.destination;
              }
            }
          }
          return [{ ...record, workspace, operations: next, error: null }, undefined];
        });
        saved = true;
      } catch (error) {
        const message = error && typeof error === 'object' && 'message' in error
          ? String(error.message) : String(error);
        await updateOffline(uid, (record) => [{
          ...record,
          conflictId: message.includes('offline_conflict') ? op.id : record.conflictId,
          error: message.includes('offline_conflict') ? null : 'Не удалось синхронизировать. Повторим при соединении.',
        }, undefined]);
        break;
      }
    }
    if (saved) {
      try {
        const remote = await fetchRemoteWorkspace(uid);
        await updateOffline(uid, (record) => [{ ...record, workspace: remote }, undefined]);
        const state = await readOffline(uid);
        qc.setQueryData(qk.workspace(uid), overlayOperations(remote, state.operations));
      } catch { /* durable local snapshot is still available; refresh on next connection */ }
      try {
        await syncGamification(uid);
        void qc.invalidateQueries({ queryKey: qk.profile(uid) });
      } catch { /* progress was saved independently of rewards */ }
    }
  })();
  active.set(uid, work);
  void work.finally(() => { if (active.get(uid) === work) active.delete(uid); }).catch(() => {});
  return work;
}

export async function resolveOfflineConflict(uid: string, choice: 'mine' | 'server', qc: QueryClient): Promise<void> {
  const remote = await fetchRemoteWorkspace(uid);
  await updateOffline(uid, (record) => {
    if (!record.conflictId) return [record, undefined];
    const blocker = record.operations.find((op) => op.id === record.conflictId);
    if (!blocker) return [{ ...record, conflictId: null }, undefined];
    if (choice === 'server') {
      const createdIds = blocker.type === 'horizon' ? new Set(blocker.input.creates.map((g) => g.id)) : new Set<string>();
      const blockedKeys = blocker.type === 'logs' ? new Set(blocker.changes.map((v) => `${v.goalId}|${v.date}`)) : new Set<string>();
      const operations = record.operations.filter((op) => {
        if (op.id === blocker.id) return false;
        if (blocker.type === 'move') return op.type === 'move' ? op.taskId !== blocker.taskId
          : op.type === 'logs' ? !op.changes.some((v) => v.goalId === blocker.taskId)
          : !op.input.updates.some((v) => v.id === blocker.taskId) && !op.input.deletes.includes(blocker.taskId);
        if (blocker.type === 'horizon') return op.type === 'horizon'
          ? revisionKey(op.kind, op.timeframe) !== revisionKey(blocker.kind, blocker.timeframe)
          : op.type === 'move'
            ? !(blocker.kind === 'task' && (op.from === blocker.timeframe || op.to === blocker.timeframe))
            : !op.changes.some((v) => createdIds.has(v.goalId));
        return op.type !== 'logs' || !op.changes.some((v) => blockedKeys.has(`${v.goalId}|${v.date}`));
      });
      return [{ ...record, workspace: remote, operations, conflictId: null, error: null }, undefined];
    }
    const operations = record.operations.map((op) => {
      if (op.id !== blocker.id) return op;
      if (op.type === 'move') {
        const current = remote.goals.find((g) => g.id === op.taskId && g.kind === 'task');
        if (!current) throw new Error('Задача удалена на другом устройстве. Выбери «Взять с сервера».');
        return { ...op, from: current.timeframe,
          expectedSourceRevision: remote.revisions?.[revisionKey('task', current.timeframe)] ?? 0,
          expectedDestinationRevision: remote.revisions?.[revisionKey('task', op.to)] ?? 0 };
      }
      if (op.type === 'horizon') {
        const desired = record.workspace ? applyOperation(record.workspace, op).goals : [];
        const touched = new Set([...op.input.updates.map((g) => g.id), ...op.input.creates.map((g) => g.id!)]);
        const localGoals = desired.filter((g) => touched.has(g.id));
        const selectedRemote = goalsForScope(remote.goals.filter((g) => g.kind === op.kind), op.timeframe, op.refDate);
        const remoteIds = new Set(remote.goals.map((g) => g.id));
        const desiredIds = new Set(localGoals.map((g) => g.id));
        const input: SaveHorizonInput = {
          updates: localGoals.filter((g) => remoteIds.has(g.id)).map((g) => ({
            id: g.id, title: g.title, target: g.target, weight: g.weight, endDate: g.endDate,
          })),
          creates: localGoals.filter((g) => !remoteIds.has(g.id)).map((g) => ({
            id: g.id, kind: g.kind, timeframe: g.timeframe, title: g.title, target: g.target,
            weight: g.weight, startDate: g.startDate, endDate: g.endDate,
          })),
          deletes: [...new Set([...selectedRemote.filter((g) => !desiredIds.has(g.id)).map((g) => g.id),
            ...op.input.deletes.filter((id) => remoteIds.has(id))])],
        };
        return { ...op, input, expectedRevision: remote.revisions?.[revisionKey(op.kind, op.timeframe)] ?? 0 };
      }
      return { ...op, changes: op.changes.map((change) => ({ ...change,
        expectedValue: remote.logs.find((log) => log.goalId === change.goalId && log.date === change.date)?.value ?? 0,
      })) };
    });
    return [{ ...record, workspace: remote, operations, conflictId: null, error: null }, undefined];
  });
  const state = await readOffline(uid);
  qc.setQueryData(qk.workspace(uid), overlayOperations(remote, state.operations));
  void synchronize(uid, qc);
}
