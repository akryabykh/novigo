import type { Goal, Timeframe } from '../domain';
import { toGoal, type GoalRow } from './mappers';
import { supabase } from './supabase';

export async function listGoalsBySessions(sessionIds: string[]): Promise<Goal[]> {
  if (sessionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as GoalRow[]).map(toGoal);
}

export interface NewGoal {
  title: string;
  timeframe: Timeframe;
  target: number;
  weight: number;
}

export async function createGoals(sessionId: string, goals: NewGoal[]): Promise<Goal[]> {
  if (goals.length === 0) return [];
  const rows = goals.map((g) => ({
    session_id: sessionId,
    title: g.title,
    timeframe: g.timeframe,
    target: g.target,
    weight: g.weight,
  }));
  const { data, error } = await supabase.from('goals').insert(rows).select('*');
  if (error) throw error;
  return (data as GoalRow[]).map(toGoal);
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) throw error;
}
