// React Query hooks — the only place screens touch the data layer.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createGoals,
  deleteGoal,
  getProfile,
  listGoalsByUser,
  listLogsByGoals,
  listAchievements,
  updateGoal,
  updateProfileNames,
  upsertLog,
  type NewGoal,
} from '../core/data';
import type { DailyLog, Goal } from '../core/domain';
import { qk } from '../core/query';
import { syncGamification } from './gamification/sync';

export interface Workspace {
  goals: Goal[];
  logs: DailyLog[];
}

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
  return useQuery({
    queryKey: qk.workspace(uid ?? 'anon'),
    queryFn: () => loadWorkspace(uid!),
    enabled: !!uid,
  });
}

export function useAchievements(uid: string | undefined) {
  return useQuery({
    queryKey: qk.achievements(uid ?? 'anon'),
    queryFn: () => listAchievements(uid!),
    enabled: !!uid,
  });
}

function useInvalidateAll(uid: string | undefined) {
  const qc = useQueryClient();
  return () => {
    if (!uid) return;
    qc.invalidateQueries({ queryKey: qk.workspace(uid) });
    qc.invalidateQueries({ queryKey: qk.profile(uid) });
    qc.invalidateQueries({ queryKey: qk.achievements(uid) });
  };
}

/** Log a value for a goal on a specific date (unique goal_id + date). */
export function useUpsertLog(uid: string | undefined) {
  const invalidate = useInvalidateAll(uid);
  return useMutation({
    mutationFn: async (input: { goalId: string; date: string; value: number }) => {
      const log = await upsertLog(input.goalId, input.date, input.value);
      if (uid) await syncGamification(uid);
      return log;
    },
    onSuccess: invalidate,
  });
}

export interface GoalUpdate {
  id: string;
  title: string;
  target: number;
  weight: number;
}

/** Create / update / delete the user's recurring goals in one shot. */
export function useSaveGoals(uid: string | undefined) {
  const invalidate = useInvalidateAll(uid);
  return useMutation({
    mutationFn: async (input: { updates: GoalUpdate[]; creates: NewGoal[]; deletes: string[] }) => {
      for (const u of input.updates) await updateGoal(u.id, u);
      for (const id of input.deletes) await deleteGoal(id);
      if (input.creates.length) await createGoals(uid!, input.creates);
      if (uid) await syncGamification(uid);
    },
    onSuccess: invalidate,
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
