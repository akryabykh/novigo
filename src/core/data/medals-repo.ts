import type { MedalPeriodResult } from '../../features/statistics/logic';
import { supabase } from './supabase';

export async function finalizeMedalPeriods(timeZone: string): Promise<number> {
  const { data, error } = await supabase.rpc('finalize_medal_periods', { p_time_zone: timeZone });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function listMedalResults(userId: string): Promise<MedalPeriodResult[]> {
  const { data, error } = await supabase.from('medal_period_results')
    .select('timeframe,period_start,period_end,completed')
    .eq('user_id', userId)
    .order('period_start', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    timeframe: row.timeframe as MedalPeriodResult['timeframe'],
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
    completed: row.completed as boolean,
  }));
}
