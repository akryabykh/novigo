import type { DailyLog } from '../domain';
import { toDailyLog, type DailyLogRow } from './mappers';
import { supabase } from './supabase';

export async function listLogsByGoals(goalIds: string[]): Promise<DailyLog[]> {
  if (goalIds.length === 0) return [];
  const { data, error } = await supabase.from('daily_logs').select('*').in('goal_id', goalIds);
  if (error) throw error;
  return (data as DailyLogRow[]).map(toDailyLog);
}

/** Upsert a date's value for a goal. Unique(goal_id, date). */
export async function upsertLog(goalId: string, date: string, value: number): Promise<DailyLog> {
  const { data, error } = await supabase
    .from('daily_logs')
    .upsert({ goal_id: goalId, date, value }, { onConflict: 'goal_id,date' })
    .select('*')
    .single();
  if (error) throw error;
  return toDailyLog(data as DailyLogRow);
}
