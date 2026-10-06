import AsyncStorage from '@react-native-async-storage/async-storage';
import { newCounterOperationId } from '../counter/counter-store';

export interface WorkSession {
  id: string;
  taskId: string | null;
  taskTitle: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}
export interface ActiveSession {
  id: string;
  taskId: string | null;
  taskTitle: string;
  startedAt: string;
  accumulatedMs: number;
  runningSince: string | null;
}
export interface StopwatchRecord {
  version: 1;
  active: ActiveSession | null;
  sessions: WorkSession[];
  pending: WorkSession[];
}
const empty = (): StopwatchRecord => ({ version: 1, active: null, sessions: [], pending: [] });
const cache = new Map<string, StopwatchRecord>();
const loading = new Map<string, Promise<StopwatchRecord>>();
const writes = new Map<string, Promise<void>>();
const keyFor = (uid: string) => `novigo.stopwatch.${uid}`;
const safeTime = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));
const safeDuration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function elapsedMs(active: ActiveSession, now = Date.now()): number {
  const running = active.runningSince ? Math.max(0, now - Date.parse(active.runningSince)) : 0;
  return Math.max(0, active.accumulatedMs + running);
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function validSession(value: unknown): value is WorkSession {
  if (!value || typeof value !== 'object') return false;
  const x = value as Partial<WorkSession>;
  return typeof x.id === 'string' && !!x.id && (x.taskId === null || typeof x.taskId === 'string')
    && typeof x.taskTitle === 'string' && safeTime(x.startedAt) && safeTime(x.endedAt) && safeDuration(x.durationMs);
}

export function parseStopwatch(raw: string | null): StopwatchRecord {
  if (!raw) return empty();
  try {
    const parsed = JSON.parse(raw) as Partial<StopwatchRecord>;
    const active = parsed.active;
    return {
      version: 1,
      active: active && typeof active.id === 'string' && (active.taskId === null || typeof active.taskId === 'string')
        && typeof active.taskTitle === 'string' && safeTime(active.startedAt)
        && (active.runningSince === null || safeTime(active.runningSince)) && safeDuration(active.accumulatedMs)
        ? active : null,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions.filter(validSession) : [],
      pending: Array.isArray(parsed.pending) ? parsed.pending.filter(validSession) : [],
    };
  } catch { return empty(); }
}

function persist(uid: string, record: StopwatchRecord): Promise<void> {
  const next = (writes.get(uid) ?? Promise.resolve()).catch(() => {})
    .then(() => AsyncStorage.setItem(keyFor(uid), JSON.stringify(record)));
  writes.set(uid, next);
  void next.finally(() => { if (writes.get(uid) === next) writes.delete(uid); }).catch(() => {});
  return next;
}

export async function readStopwatch(uid: string): Promise<StopwatchRecord> {
  const cached = cache.get(uid);
  if (cached) return cached;
  const existing = loading.get(uid);
  if (existing) return existing;
  const promise = AsyncStorage.getItem(keyFor(uid)).then((raw) => {
    const record = parseStopwatch(raw);
    cache.set(uid, record);
    return record;
  });
  loading.set(uid, promise);
  try { return await promise; }
  finally { if (loading.get(uid) === promise) loading.delete(uid); }
}

export async function changeStopwatch(uid: string, change: (current: StopwatchRecord) => StopwatchRecord): Promise<StopwatchRecord> {
  await readStopwatch(uid);
  const next = change(cache.get(uid)!);
  cache.set(uid, next);
  await persist(uid, next);
  return next;
}

export async function mergeStopwatch(uid: string, remote: WorkSession[], sentIds: string[]): Promise<StopwatchRecord> {
  await readStopwatch(uid);
  const current = cache.get(uid)!;
  const ids = new Set(sentIds);
  const sessions = new Map<string, WorkSession>();
  for (const item of remote) sessions.set(item.id, item);
  for (const item of current.sessions) if (!sessions.has(item.id)) sessions.set(item.id, item);
  const next: StopwatchRecord = {
    ...current,
    sessions: [...sessions.values()].sort((a, b) => b.endedAt.localeCompare(a.endedAt)),
    pending: current.pending.filter((item) => !ids.has(item.id)),
  };
  cache.set(uid, next);
  await persist(uid, next);
  return next;
}

export async function retryStopwatchWrite(uid: string): Promise<void> {
  await readStopwatch(uid);
  await persist(uid, cache.get(uid)!);
}

export function startSession(taskId: string | null, taskTitle: string, now = new Date()): ActiveSession {
  const time = now.toISOString();
  return { id: newCounterOperationId(), taskId, taskTitle, startedAt: time, accumulatedMs: 0, runningSince: time };
}

export function pauseSession(active: ActiveSession, now = new Date()): ActiveSession {
  if (!active.runningSince) return active;
  return { ...active, accumulatedMs: elapsedMs(active, now.getTime()), runningSince: null };
}

export function finishSession(active: ActiveSession, now = new Date()): WorkSession {
  return { id: active.id, taskId: active.taskId, taskTitle: active.taskTitle,
    startedAt: active.startedAt, endedAt: now.toISOString(), durationMs: elapsedMs(active, now.getTime()) };
}
