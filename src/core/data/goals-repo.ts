import type { Goal, Timeframe } from '../domain';
import { toGoal, type GoalRow } from './mappers';
import { supabase } from './supabase';

/**
 * All active goals of a user — the recurring templates.
 *
 * `archived` is a latent soft-delete column (added back in migration 0002/0003).
 * The app currently HARD-deletes goals via save_horizon, so nothing sets
 * archived=true today — but the column and this `archived=false` filter are kept
 * intentionally so a future "archive instead of delete" flow needs no migration
 * (migrations are never rewritten here). Harmless while unused.
 */
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
  id?: string;
  kind: Goal['kind'];
  title: string;
  timeframe: Timeframe;
  target: number;
  weight: number;
  startDate: string;
  endDate: string | null;
}

/** Patch shape for an existing goal (kind & timeframe are immutable after creation). */
export interface GoalPatch {
  id: string;
  title: string;
  target: number;
  weight: number;
  endDate: string | null;
}

export interface SaveHorizonInput {
  updates: GoalPatch[];
  creates: NewGoal[];
  deletes: string[];
}

/**
 * Persist a whole horizon edit ATOMICALLY via the save_horizon RPC (migration 0007):
 * updates + deletes + creates run in one transaction, each row checked against
 * auth.uid(). Either the whole horizon saves or nothing does — no partial state
 * where the weights no longer sum to 100.
 */
export async function saveHorizon(input: SaveHorizonInput): Promise<void> {
  const { error } = await supabase.rpc('save_horizon', {
    p_updates: input.updates.map((u) => ({
      id: u.id,
      title: u.title,
      target: u.target,
      weight: u.weight,
      endDate: u.endDate,
    })),
    p_creates: input.creates.map((c) => ({
      kind: c.kind,
      title: c.title,
      timeframe: c.timeframe,
      target: c.target,
      weight: c.weight,
      startDate: c.startDate,
      endDate: c.endDate,
    })),
    p_deletes: input.deletes,
  });
  if (error) throw error;
}
