// React Query hooks — the only place screens touch the data layer.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createGoals,
  createSession,
  deleteGoal,
  deleteSession,
  getActiveSession,
  getProfile,
  listAchievements,
  listGoalsBySessions,
  listLogsByGoals,
  updateGoal,
  updateProfileNames,
  upsertLog,
  type NewGoal,
} from '../core/data';
import type { DailyLog, Goal, GoalSession } from '../core/domain';
import { qk } from '../core/query';
import { syncGamification } from './gamification/sync';

export interface Workspace {
  session: GoalSession | null;
  goals: Goal[];
  logs: DailyLog[];
}

async function loadWorkspace(uid: string): Promise<Workspace> {
  const session = await getActiveSession(uid);
  if (!session) return { session: null, goals: [], logs: [] };
  const goals = await listGoalsBySessions([session.id]);
  const logs = await listLogsByGoals(goals.map((g) => g.id));
  return { session, goals, logs };
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

/** Create a new goal session with its goals (day/week/month). */
export function useCreateSession(uid: string | undefined) {
  const invalidate = useInvalidateAll(uid);
  return useMutation({
    mutationFn: async (goals: NewGoal[]) => {
      const session = await createSession(uid!);
      await createGoals(session.id, goals);
      return session;
    },
    onSuccess: invalidate,
  });
}

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
export function useSaveGoals(uid: string | undefined) {
  const invalidate = useInvalidateAll(uid);
  return useMutation({
    mutationFn: async (input: {
      sessionId: string;
      updates: GoalUpdate[];
      creates: NewGoal[];
      deletes: string[];
    }) => {
      for (const u of input.updates) await updateGoal(u.id, u);
      for (const id of input.deletes) await deleteGoal(id);
      if (input.creates.length) await createGoals(input.sessionId, input.creates);
      if (uid) await syncGamification(uid);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSession(uid: string | undefined) {
  const invalidate = useInvalidateAll(uid);
  return useMutation({
    mutationFn: (sessionId: string) => deleteSession(sessionId),
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
