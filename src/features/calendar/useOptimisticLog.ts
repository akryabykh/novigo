import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { upsertLogs } from '../../core/data';
import { syncGamificationSafe } from '../queries';
import type { LogInput } from './log-cache';
import { getLogWriter } from './log-writer';
import { queueLogs } from '../offline/sync';

export function useOptimisticLog(uid: string | undefined) {
  const qc = useQueryClient();
  const writer = getLogWriter(qc, uid ?? 'anon', (changes) => Platform.OS === 'web'
    ? queueLogs(uid!, changes, qc) : upsertLogs(changes), () => {
    if (uid && Platform.OS !== 'web') void syncGamificationSafe(uid, qc);
  });
  const state = useSyncExternalStore(writer.subscribe, writer.getSnapshot, writer.getSnapshot);
  const logValues = (changes: LogInput[]) => uid ? writer.enqueue(changes) : Promise.resolve();
  const logValue = (goalId: string, date: string, value: number) => logValues([{ goalId, date, value }]);

  return { logValue, logValues, isSaving: state.pending, saveError: state.error, clearSaveError: writer.clearError };
}
