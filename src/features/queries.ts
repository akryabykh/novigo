// React Query hooks — the only place screens touch the data layer.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  getProfile,
  listGoalsByUser,
  listLogsByGoals,
  saveHorizon,
  updateProfileNames,
  type GoalPatch,
  type SaveHorizonInput,
} from '../core/data';
import type { DailyLog, Goal } from '../core/domain';
import { qk } from '../core/query';
import { syncGamification } from './gamification/sync';
import { overlayPendingLogs } from './calendar/log-writer';

export interface Workspace {
  goals: Goal[];
  logs: DailyLog[];
}

/** Re-exported so the editor/screens keep a single name for a goal patch. */
export type GoalUpdate = GoalPatch;

async function loadWorkspace(uid: string): Promise<Workspace> {
  const goals = await listGoalsByUser(uid);
  if (goals.length === 0) return { goals: [], logs: [] };
  const logs = await listLogsByGoals(goals.map((g) => g.id));
  return { goals, logs };
}

export function useProfile(uid: string | undefined) {
  return useQuery({
    queryKey: qk.profile(uid ?? 'anon'),
    queryFn: () => getProfile(uid!),
    enabled: !!uid,
  });
}

export function useWorkspace(uid: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.workspace(uid ?? 'anon'),
    queryFn: async () => overlayPendingLogs(qc, uid!, await loadWorkspace(uid!)),
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

/** Create / update / delete the user's goals in one atomic RPC transaction. */
export function useSaveGoals(uid: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveHorizonInput) => saveHorizon(input),
    onSuccess: () => {
      if (!uid) return;
      qc.invalidateQueries({ queryKey: qk.workspace(uid) });
      // fire-and-forget; a gamification error does not fail the save
      void syncGamificationSafe(uid, qc);
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
