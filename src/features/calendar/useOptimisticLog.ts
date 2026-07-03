// Optimistic progress logging on top of the workspace query cache.
//
// One source of truth: the React Query workspace cache. A tap patches the cache
// immediately (instant UI), and the network write is debounced. On failure we
// roll the cache back to the server snapshot captured before the burst; either
// way we invalidate to reconcile with the server. No eternal local overrides.
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { upsertLog } from '../../core/data';
import { qk } from '../../core/query';
import { syncGamificationSafe, type Workspace } from '../queries';
import { applyLog, type LogInput } from './log-cache';

const DEBOUNCE_MS = 500;

export function useOptimisticLog(uid: string | undefined) {
  const qc = useQueryClient();
  const wsKey = qk.workspace(uid ?? 'anon');
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // server truth captured at the start of a burst; used to roll back on error
  const snapshot = useRef<Workspace | undefined>(undefined);
  const [saveError, setSaveError] = useState<Error | null>(null);

  // clear any pending debounce timers on unmount
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const flush = async (v: LogInput) => {
    try {
      await upsertLog(v.goalId, v.date, v.value);
      if (uid) void syncGamificationSafe(uid, qc); // secondary, non-fatal
      snapshot.current = undefined;
    } catch (err) {
      if (snapshot.current) qc.setQueryData(wsKey, snapshot.current); // rollback
      snapshot.current = undefined;
      setSaveError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      qc.invalidateQueries({ queryKey: wsKey }); // reconcile with server (onSettled)
    }
  };

  const logValue = async (goalId: string, date: string, value: number) => {
    if (!uid) return;
    const v: LogInput = { goalId, date, value };
    const key = `${goalId}|${date}`;
    setSaveError(null);
    await qc.cancelQueries({ queryKey: wsKey });
    if (!snapshot.current) snapshot.current = qc.getQueryData<Workspace>(wsKey);
    qc.setQueryData<Workspace>(wsKey, (prev) => (prev ? applyLog(prev, v) : prev));
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => void flush(v), DEBOUNCE_MS);
  };

  return { logValue, saveError, clearSaveError: () => setSaveError(null) };
}
