import type { GoalSession } from '../domain';
import { toSession, type SessionRow } from './mappers';
import { supabase } from './supabase';

export async function listSessions(userId: string): Promise<GoalSession[]> {
  const { data, error } = await supabase
    .from('goal_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('archived', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as SessionRow[]).map(toSession);
}

/** Most recent active session, or null. */
export async function getActiveSession(userId: string): Promise<GoalSession | null> {
  const sessions = await listSessions(userId);
  return sessions[0] ?? null;
}

export async function createSession(userId: string): Promise<GoalSession> {
  const { data, error } = await supabase
    .from('goal_sessions')
    .insert({ user_id: userId })
    .select('*')
    .single();
  if (error) throw error;
  return toSession(data as SessionRow);
}

export async function archiveSession(id: string): Promise<void> {
  const { error } = await supabase.from('goal_sessions').update({ archived: true }).eq('id', id);
  if (error) throw error;
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('goal_sessions').delete().eq('id', id);
  if (error) throw error;
}
