import { supabase } from '../../core/data/supabase';
import { acknowledgeCounter, loadCounterRecord, retryCounterWrite, type CounterState } from './counter-store';

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

function parseServerState(value: unknown): CounterState {
  if (!value || typeof value !== 'object') throw new Error('Сервер вернул неверное состояние счётчика.');
  const state = value as CounterState;
  if (!Number.isSafeInteger(state.value) || state.value < 0 || !Array.isArray(state.snapshots)) {
    throw new Error('Сервер вернул неверное состояние счётчика.');
  }
  return state;
}

async function doSync(uid: string, pendingOnly: boolean): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  let record = await loadCounterRecord(uid);
  let sent = false;
  if (record.pending.length) await retryCounterWrite(uid);
  while (record.pending.length) {
    const batch = record.pending.slice(0, 100);
    const { data, error } = await supabase.rpc('apply_counter_operations', { p_operations: batch });
    if (error) throw error;
    record = await acknowledgeCounter(uid, batch.map((item) => item.id), parseServerState(data));
    sent = true;
    notifyCounter(uid);
  }
  if (pendingOnly || sent) return;
  const { data, error } = await supabase.rpc('get_counter_state');
  if (error) throw error;
  await acknowledgeCounter(uid, [], parseServerState(data));
  notifyCounter(uid);
}

export function syncCounter(uid: string, pendingOnly = false): Promise<void> {
  const existing = active.get(uid);
  if (existing) {
    if (pendingOnly || !existing.pendingOnly) return existing.promise;
    return existing.promise.then(() => syncCounter(uid));
  }
  const next = doSync(uid, pendingOnly).finally(() => {
    if (active.get(uid)?.promise === next) active.delete(uid);
  });
  active.set(uid, { promise: next, pendingOnly });
  return next;
}
