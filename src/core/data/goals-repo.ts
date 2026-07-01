import type { Goal, Timeframe } from '../domain';
import { toGoal, type GoalRow } from './mappers';
import { supabase } from './supabase';

/** All active (non-archived) goals of a user — the recurring templates. */
export async function listGoalsByUser(userId: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('archived', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as GoalRow[]).map(toGoal);
}

export interface NewGoal {
  title: string;
  timeframe: Timeframe;
  target: number;
  weight: number;
  startDate: string;
  endDate: string | null;
}

export async function createGoals(userId: string, goals: NewGoal[]): Promise<Goal[]> {
  if (goals.length === 0) return [];
  const rows = goals.map((g) => ({
    user_id: userId,
    title: g.title,
    timeframe: g.timeframe,
    target: g.target,
    weight: g.weight,
    start_date: g.startDate,
    end_date: g.endDate,
  }));
  const { data, error } = await supabase.from('goals').insert(rows).select('*');
  if (error) throw error;
  return (data as GoalRow[]).map(toGoal);
}

export async function updateGoal(
  id: string,
  patch: { title: string; target: number; weight: number; endDate: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('goals')
    .update({ title: patch.title, target: patch.target, weight: patch.weight, end_date: patch.endDate })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) throw error;
}
