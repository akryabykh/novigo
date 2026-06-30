import type { Achievement, AchievementCode } from '../domain';
import { toAchievement, type AchievementRow } from './mappers';
import { supabase } from './supabase';

export async function listAchievements(userId: string): Promise<Achievement[]> {
  const { data, error } = await supabase.from('achievements').select('*').eq('user_id', userId);
  if (error) throw error;
  return (data as AchievementRow[]).map(toAchievement);
}

/** Insert new unlocks; existing ones are ignored (unique(user_id, code)). */
export async function unlockAchievements(userId: string, codes: AchievementCode[]): Promise<void> {
  if (codes.length === 0) return;
  const rows = codes.map((code) => ({ user_id: userId, code }));
  const { error } = await supabase
    .from('achievements')
    .upsert(rows, { onConflict: 'user_id,code', ignoreDuplicates: true });
  if (error) throw error;
}
