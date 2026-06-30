import type { Period, Program, ProgramStatus } from '../domain';
import { toProgram, type ProgramRow } from './mappers';
import { supabase } from './supabase';

export async function listPrograms(userId: string): Promise<Program[]> {
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as ProgramRow[]).map(toProgram);
}

export async function getProgram(id: string): Promise<Program | null> {
  const { data, error } = await supabase.from('programs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toProgram(data as ProgramRow) : null;
}

export interface CreateProgramInput {
  userId: string;
  title: string;
  period: Period;
}

/** end_date is computed by the DB trigger from period; we read it back. */
export async function createProgram(input: CreateProgramInput): Promise<Program> {
  const { data, error } = await supabase
    .from('programs')
    .insert({ user_id: input.userId, title: input.title, period: input.period })
    .select('*')
    .single();
  if (error) throw error;
  return toProgram(data as ProgramRow);
}

export async function updateProgramStatus(id: string, status: ProgramStatus): Promise<void> {
  const { error } = await supabase.from('programs').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteProgram(id: string): Promise<void> {
  const { error } = await supabase.from('programs').delete().eq('id', id);
  if (error) throw error;
}
