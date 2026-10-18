import type { Timeframe } from '../../core/domain';
import { supabase } from '../../core/data/supabase';

export interface Family {
  id: string;
  inviteCode: string;
  timeZone: string;
  memberCount: number;
}

export interface FamilyTask {
  id: string;
  familyId: string;
  title: string;
  timeframe: Timeframe;
  periodStart: string;
  done: boolean;
  createdBy: string | null;
}

export interface FamilySnapshot {
  family: Family | null;
  tasks: FamilyTask[];
}

export interface FamilyOperation {
  id: string;
  familyId: string;
  taskId: string;
  action: 'create' | 'toggle' | 'delete';
  title: string | null;
  timeframe: Timeframe | null;
  periodStart: string | null;
  done: boolean | null;
  requestedAt: string;
}

export async function fetchFamily(uid: string): Promise<FamilySnapshot> {
  const { data: membership, error: memberError } = await supabase.from('family_members')
    .select('family_id').eq('user_id', uid).maybeSingle();
  if (memberError) throw memberError;
  if (!membership) return { family: null, tasks: [] };
  const fid = membership.family_id as string;
  const [{ data: family, error: familyError }, { data: tasks, error: taskError }] = await Promise.all([
    supabase.from('families').select('id,invite_code,time_zone,member_count').eq('id', fid).single(),
    supabase.from('family_tasks').select('id,family_id,title,timeframe,period_start,done,created_by')
      .eq('family_id', fid).order('created_at', { ascending: true }),
  ]);
  if (familyError) throw familyError;
  if (taskError) throw taskError;
  return {
    family: { id: family.id, inviteCode: family.invite_code, timeZone: family.time_zone, memberCount: family.member_count },
    tasks: (tasks ?? []).map((task) => ({
      id: task.id, familyId: task.family_id, title: task.title, timeframe: task.timeframe as Timeframe,
      periodStart: task.period_start, done: task.done, createdBy: task.created_by,
    })),
  };
}

export async function createFamily(timeZone: string): Promise<void> {
  const { error } = await supabase.rpc('create_family', { p_time_zone: timeZone });
  if (error) throw error;
}

export async function joinFamily(code: string): Promise<void> {
  const { error } = await supabase.rpc('join_family', { p_code: code.trim() });
  if (error) throw error;
}

export async function leaveFamily(): Promise<void> {
  const { error } = await supabase.rpc('leave_family');
  if (error) throw error;
}

export async function sendFamilyOperation(op: FamilyOperation): Promise<void> {
  const { error } = await supabase.rpc('apply_family_task_operation', {
    p_operation_id: op.id,
    p_family_id: op.familyId,
    p_task_id: op.taskId,
    p_action: op.action,
    p_title: op.title,
    p_timeframe: op.timeframe,
    p_period_start: op.periodStart,
    p_done: op.done,
    p_requested_at: op.requestedAt,
  });
  if (error) throw error;
}
