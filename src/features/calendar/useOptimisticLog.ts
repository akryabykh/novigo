import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { upsertLogs } from '../../core/data';
import { syncGamificationSafe } from '../queries';
import type { LogInput } from './log-cache';
import { getLogWriter } from './log-writer';

export function useOptimisticLog(uid: string | undefined) {
  const qc = useQueryClient();
  const writer = getLogWriter(qc, uid ?? 'anon', upsertLogs, () => {
    if (uid) void syncGamificationSafe(uid, qc);
  });
  const state = useSyncExternalStore(writer.subscribe, writer.getSnapshot, writer.getSnapshot);
  const logValues = (changes: LogInput[]) => uid ? writer.enqueue(changes) : Promise.resolve();
  const logValue = (goalId: string, date: string, value: number) => logValues([{ goalId, date, value }]);

  return { logValue, logValues, isSaving: state.pending, saveError: state.error, clearSaveError: writer.clearError };
}
