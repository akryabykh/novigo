// Recompute gamification from the active session and persist it.
// Called after any write that can change progress (logging).
import {
  getActiveSession,
  listGoalsBySessions,
  listLogsByGoals,
  unlockAchievements,
  updateGamification,
} from '../../core/data';
import { computeProfileStats, detectAchievements } from './engine';

export async function syncGamification(uid: string) {
  const session = await getActiveSession(uid);
  if (!session) {
    await updateGamification(uid, { xp: 0, level: 1, currentStreak: 0, bestStreak: 0 });
    return;
  }
  const goals = await listGoalsBySessions([session.id]);
  const logs = await listLogsByGoals(goals.map((g) => g.id));
  const bundle = { session, goals, logs };

  const stats = computeProfileStats(bundle);
  await updateGamification(uid, stats);
  await unlockAchievements(uid, detectAchievements(bundle));
  return stats;
}
