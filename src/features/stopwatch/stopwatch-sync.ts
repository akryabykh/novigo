import { supabase } from '../../core/data/supabase';
import { mergeStopwatch, readStopwatch, retryStopwatchWrite, type WorkSession } from './stopwatch-store';

const active = new Map<string, { promise: Promise<void>; pendingOnly: boolean }>();
const listeners = new Map<string, Set<() => void>>();
export function subscribeStopwatch(uid: string, listener: () => void): () => void {
  const set = listeners.get(uid) ?? new Set<() => void>();
  set.add(listener); listeners.set(uid, set);
  return () => { set.delete(listener); if (!set.size) listeners.delete(uid); };
}
export function notifyStopwatch(uid: string): void { listeners.get(uid)?.forEach((listener) => listener()); }

async function doSync(uid: string, pendingOnly: boolean): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  let local = await readStopwatch(uid);
  if (local.pending.length) await retryStopwatchWrite(uid);
  while (local.pending.length) {
    const batch = local.pending.slice(0, 100);
    const { error } = await supabase.from('work_sessions').upsert(batch.map((item) => ({
      user_id: uid, id: item.id, task_id: item.taskId, task_title: item.taskTitle,
      started_at: item.startedAt, ended_at: item.endedAt, duration_ms: item.durationMs,
    })), { onConflict: 'user_id,id' });
    if (error) throw error;
    local = await mergeStopwatch(uid, batch, batch.map((item) => item.id));
    notifyStopwatch(uid);
  }
  if (pendingOnly) return;
  const { data, error } = await supabase.from('work_sessions')
    .select('id,task_id,task_title,started_at,ended_at,duration_ms')
    .eq('user_id', uid).order('ended_at', { ascending: false });
  if (error) throw error;
  const remote: WorkSession[] = (data ?? []).map((row) => ({
    id: row.id, taskId: row.task_id, taskTitle: row.task_title,
    startedAt: row.started_at, endedAt: row.ended_at, durationMs: Number(row.duration_ms),
  }));
  await mergeStopwatch(uid, remote, []);
  notifyStopwatch(uid);
}

export function syncStopwatch(uid: string, pendingOnly = false): Promise<void> {
  const running = active.get(uid);
  if (running) {
    if (pendingOnly || !running.pendingOnly) return running.promise;
    return running.promise.then(() => syncStopwatch(uid));
  }
  const promise = doSync(uid, pendingOnly).finally(() => {
    if (active.get(uid)?.promise === promise) active.delete(uid);
  });
  active.set(uid, { promise, pendingOnly });
  return promise;
}
