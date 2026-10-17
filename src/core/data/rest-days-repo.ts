import { supabase } from './index';

export async function listRestDays(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('rest_days').select('day').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.day as string);
}

export async function setRestDay(day: string, enabled: boolean, timeZone: string,
  requestedAt: string, operationId: string | null = null): Promise<void> {
  const { error } = await supabase.rpc('set_rest_day', {
    p_day: day, p_enabled: enabled, p_time_zone: timeZone, p_requested_at: requestedAt,
    p_operation_id: operationId,
  });
  if (error) throw error;
}
