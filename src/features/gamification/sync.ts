// Recompute gamification from the user's goals + logs and persist it.
// Called after any write that can change progress (logging, editing goals).
import {
  listGoalsByUser,
  listLogsByGoals,
  unlockAchievements,
  updateGamification,
} from '../../core/data';
import { computeProfileStats, detectAchievements } from './engine';

export async function syncGamification(uid: string) {
  const goals = await listGoalsByUser(uid);
  if (goals.length === 0) {
    await updateGamification(uid, { xp: 0, level: 1, currentStreak: 0, bestStreak: 0 });
    return;
  }
  const logs = await listLogsByGoals(goals.map((g) => g.id));
  const bundle = { goals, logs };

  const stats = computeProfileStats(bundle);
  await updateGamification(uid, stats);
  await unlockAchievements(uid, detectAchievements(bundle));
  return stats;
}
