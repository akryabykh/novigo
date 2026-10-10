import { supabase } from '../../core/data/supabase';
import { acknowledgeCounter, loadCounterRecord, parseCounterCollection, retryCounterWrite } from './counter-store';

const active = new Map<string, { promise: Promise<void>; pendingOnly: boolean }>();
const listeners = new Map<string, Set<() => void>>();

export function subscribeCounter(uid: string, listener: () => void): () => void {
  const current = listeners.get(uid) ?? new Set<() => void>();
  current.add(listener);
  listeners.set(uid, current);
  return () => { current.delete(listener); if (!current.size) listeners.delete(uid); };
}

export function notifyCounter(uid: string): void {
  listeners.get(uid)?.forEach((listener) => listener());
}

async function doSync(uid: string, pendingOnly: boolean): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  let record = await loadCounterRecord(uid);
  if (record.pending.length) await retryCounterWrite(uid);
  while (record.pending.length) {
    const batch = record.pending.slice(0, 100);
    const { data, error } = await supabase.rpc('apply_counter_actions', { p_actions: batch });
    if (error) throw error;
    record = await acknowledgeCounter(uid, batch.map((item) => item.id), parseCounterCollection(data));
    notifyCounter(uid);
  }
  if (pendingOnly) return;
  const { data, error } = await supabase.rpc('get_counters_state');
  if (error) throw error;
  await acknowledgeCounter(uid, [], parseCounterCollection(data));
  notifyCounter(uid);
}

export function syncCounter(uid: string, pendingOnly = false): Promise<void> {
  const existing = active.get(uid);
  if (existing) {
    return existing.promise.then(async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (!pendingOnly && existing.pendingOnly) return syncCounter(uid);
      if ((await loadCounterRecord(uid)).pending.length) return syncCounter(uid, pendingOnly);
    });
  }
  const next = doSync(uid, pendingOnly).finally(() => {
    if (active.get(uid)?.promise === next) active.delete(uid);
  });
  active.set(uid, { promise: next, pendingOnly });
  return next;
}
