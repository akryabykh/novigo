import type { DailyLog } from '../domain';
import { toDailyLog, type DailyLogRow } from './mappers';
import { supabase } from './supabase';

export async function listLogsByTasks(taskIds: string[]): Promise<DailyLog[]> {
  if (taskIds.length === 0) return [];
  const { data, error } = await supabase.from('daily_logs').select('*').in('task_id', taskIds);
  if (error) throw error;
  return (data as DailyLogRow[]).map(toDailyLog);
}

/** Upsert today's (or any date's) value for a task. Unique(task_id, date). */
export async function upsertLog(taskId: string, date: string, value: number): Promise<DailyLog> {
  const { data, error } = await supabase
    .from('daily_logs')
    .upsert({ task_id: taskId, date, value }, { onConflict: 'task_id,date' })
    .select('*')
    .single();
  if (error) throw error;
  return toDailyLog(data as DailyLogRow);
}
