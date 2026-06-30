import type { Profile } from '../domain';
import { toProfile, type ProfileRow } from './mappers';
import { supabase } from './supabase';

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data ? toProfile(data as ProfileRow) : null;
}

export interface CreateProfileInput {
  id: string;
  firstName: string;
  lastName?: string | null;
  middleName?: string | null;
}

export async function createProfile(input: CreateProfileInput): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: input.id,
      first_name: input.firstName,
      last_name: input.lastName ?? null,
      middle_name: input.middleName ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return toProfile(data as ProfileRow);
}

export async function updateProfileNames(
  userId: string,
  patch: { firstName: string; lastName?: string | null; middleName?: string | null },
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      first_name: patch.firstName,
      last_name: patch.lastName ?? null,
      middle_name: patch.middleName ?? null,
    })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return toProfile(data as ProfileRow);
}

export async function updateGamification(
  userId: string,
  g: { xp: number; level: number; currentStreak: number; bestStreak: number },
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      xp: g.xp,
      level: g.level,
      current_streak: g.currentStreak,
      best_streak: g.bestStreak,
    })
    .eq('id', userId);
  if (error) throw error;
}
