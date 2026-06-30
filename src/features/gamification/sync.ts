// Recompute gamification from current data and persist it (profile stats + unlocks).
// Called after any write that can change progress (logging, completing a program).
import {
  listLogsByTasks,
  listPrograms,
  listTasksByPrograms,
  unlockAchievements,
  updateGamification,
} from '../../core/data';
import { computeProfileStats, detectAchievements } from './engine';

export async function syncGamification(uid: string) {
  const programs = await listPrograms(uid);
  const tasks = await listTasksByPrograms(programs.map((p) => p.id));
  const logs = await listLogsByTasks(tasks.map((t) => t.id));
  const bundle = { programs, tasks, logs };

  const stats = computeProfileStats(bundle);
  await updateGamification(uid, stats);
  await unlockAchievements(uid, detectAchievements(bundle));
  return stats;
}
