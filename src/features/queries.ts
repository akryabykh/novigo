// React Query hooks — the only place screens touch the data layer.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

import {
  getProfile,
  listGoalsByUser,
  listLogsByGoals,
  saveHorizon,
  updateProfileNames,
  type GoalPatch,
  type SaveHorizonInput,
} from '../core/data';
import type { DailyLog, Goal, GoalKind, Timeframe } from '../core/domain';
import { qk } from '../core/query';
import { syncGamification } from './gamification/sync';
import { overlayPendingLogs } from './calendar/log-writer';
import { loadOfflineWorkspace, queueHorizon } from './offline/sync';
import { readOffline, updateOffline } from './offline/store';

export interface Workspace {
  goals: Goal[];
  logs: DailyLog[];
  revisions?: Record<string, number>;
}

async function loadNativeWorkspace(uid: string): Promise<Workspace> {
  const goals = await listGoalsByUser(uid);
  return { goals, logs: await listLogsByGoals(goals.map((g) => g.id)) };
}

/** Re-exported so the editor/screens keep a single name for a goal patch. */
export type GoalUpdate = GoalPatch;

export function useProfile(uid: string | undefined) {
  return useQuery({
    queryKey: qk.profile(uid ?? 'anon'),
    queryFn: async () => {
      const cached = await readOffline(uid!);
      if (typeof navigator !== 'undefined' && navigator.onLine === false && cached.profile) return cached.profile;
      try {
        const profile = await getProfile(uid!);
        if (profile) await updateOffline(uid!, (record) => [{ ...record, profile }, undefined]);
        return profile;
      } catch (error) {
        if (cached.profile) return cached.profile;
        throw error;
      }
    },
    enabled: !!uid,
  });
}

export function useWorkspace(uid: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.workspace(uid ?? 'anon'),
    queryFn: async () => overlayPendingLogs(qc, uid!, Platform.OS === 'web'
      ? await loadOfflineWorkspace(uid!, qc) : await loadNativeWorkspace(uid!)),
    enabled: !!uid,
  });
}

/**
 * Gamification is a SECONDARY, best-effort recompute. It must never turn a
 * successful primary write (log / goals) into a failure — so it runs detached
 * with its own try/catch and only invalidates the profile on success.
 */
export async function syncGamificationSafe(uid: string, qc: QueryClient): Promise<void> {
  try {
    await syncGamification(uid);
    qc.invalidateQueries({ queryKey: qk.profile(uid) });
  } catch (err) {
    // Non-fatal: the log/goals already saved. Surface only in logs.
    console.warn('[gamification] sync failed (non-fatal):', err);
  }
}

/** Web saves locally first; both paths commit the whole horizon atomically on the server. */
export function useSaveGoals(uid: string | undefined, kind: GoalKind, timeframe: Timeframe, refDate: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveHorizonInput) => Platform.OS === 'web'
      ? queueHorizon(uid!, kind, timeframe, refDate, input, qc) : saveHorizon(input),
    onSuccess: () => {
      if (!uid) return;
      qc.invalidateQueries({ queryKey: qk.workspace(uid) });
      if (Platform.OS !== 'web') void syncGamificationSafe(uid, qc);
    },
  });
}

export function useUpdateNames(uid: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { firstName: string; lastName?: string; middleName?: string }) =>
      updateProfileNames(uid!, patch),
    onSuccess: () => uid && qc.invalidateQueries({ queryKey: qk.profile(uid) }),
  });
}
