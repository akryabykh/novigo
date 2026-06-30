import type { GoalType, Task } from '../domain';
import { toTask, type TaskRow } from './mappers';
import { supabase } from './supabase';

export async function listTasksByProgram(programId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('program_id', programId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as TaskRow[]).map(toTask);
}

export async function listTasksByPrograms(programIds: string[]): Promise<Task[]> {
  if (programIds.length === 0) return [];
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .in('program_id', programIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as TaskRow[]).map(toTask);
}

export interface NewTask {
  title: string;
  goalType: GoalType;
  target: number;
  unit?: string | null;
  weight: number;
}

export async function createTasks(programId: string, tasks: NewTask[]): Promise<Task[]> {
  if (tasks.length === 0) return [];
  const rows = tasks.map((t) => ({
    program_id: programId,
    title: t.title,
    goal_type: t.goalType,
    target: t.target,
    unit: t.unit ?? null,
    weight: t.weight,
  }));
  const { data, error } = await supabase.from('tasks').insert(rows).select('*');
  if (error) throw error;
  return (data as TaskRow[]).map(toTask);
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}
