// React Query hooks — the only place screens touch the data layer.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createProgram,
  createTasks,
  deleteProgram,
  getProfile,
  listAchievements,
  listLogsByTasks,
  listPrograms,
  listTasksByPrograms,
  updateProfileNames,
  updateProgramStatus,
  upsertLog,
  type NewTask,
} from '../core/data';
import type { DailyLog, Period, Program, ProgramStatus, Task } from '../core/domain';
import { qk } from '../core/query';
import { syncGamification } from './gamification/sync';

export interface Workspace {
  programs: Program[];
  tasks: Task[];
  logs: DailyLog[];
}

async function loadWorkspace(uid: string): Promise<Workspace> {
  const programs = await listPrograms(uid);
  const tasks = await listTasksByPrograms(programs.map((p) => p.id));
  const logs = await listLogsByTasks(tasks.map((t) => t.id));
  return { programs, tasks, logs };
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

export function useCreateProgram(uid: string | undefined) {
  const invalidate = useInvalidateAll(uid);
  return useMutation({
    mutationFn: async (input: { title: string; period: Period; tasks: NewTask[] }) => {
      const program = await createProgram({ userId: uid!, title: input.title, period: input.period });
      await createTasks(program.id, input.tasks);
      return program;
    },
    onSuccess: invalidate,
  });
}

export function useUpsertLog(uid: string | undefined) {
  const invalidate = useInvalidateAll(uid);
  return useMutation({
    mutationFn: async (input: { taskId: string; date: string; value: number }) => {
      const log = await upsertLog(input.taskId, input.date, input.value);
      if (uid) await syncGamification(uid);
      return log;
    },
    onSuccess: invalidate,
  });
}

export function useSetProgramStatus(uid: string | undefined) {
  const invalidate = useInvalidateAll(uid);
  return useMutation({
    mutationFn: async (input: { programId: string; status: ProgramStatus }) => {
      await updateProgramStatus(input.programId, input.status);
      if (uid) await syncGamification(uid);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteProgram(uid: string | undefined) {
  const invalidate = useInvalidateAll(uid);
  return useMutation({
    mutationFn: (programId: string) => deleteProgram(programId),
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
