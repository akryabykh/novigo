import type { Profile, GoalKind, Timeframe } from '../../core/domain';
import type { SaveHorizonInput } from '../../core/data';
import type { Workspace } from '../queries';
import type { LogInput } from '../calendar/log-cache';

export type StoredLog = LogInput & { expectedValue: number };
export type OfflineOperation =
  | { id: string; type: 'horizon'; userId: string; kind: GoalKind; timeframe: Timeframe; refDate: string; expectedRevision: number; input: SaveHorizonInput }
  | { id: string; type: 'logs'; changes: StoredLog[] };

export interface OfflineRecord {
  workspace: Workspace | null;
  profile: Profile | null;
  operations: OfflineOperation[];
  conflictId: string | null;
  error: string | null;
}

const blank = (): OfflineRecord => ({ workspace: null, profile: null, operations: [], conflictId: null, error: null });
const memory = new Map<string, OfflineRecord>();
const pending = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();
let dbPromise: Promise<IDBDatabase> | null = null;
let status: Record<string, { pending: number; conflict: boolean; error: string | null }> = {};
const emptyStatus = { pending: 0, conflict: false, error: null };

export const subscribeOffline = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getOfflineStatus = (uid: string) => status[uid] ?? emptyStatus;
function publish(uid: string, record: OfflineRecord) {
  status = { ...status, [uid]: { pending: record.operations.length, conflict: !!record.conflictId, error: record.error } };
  listeners.forEach((fn) => fn());
}

function db(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('novigo-offline', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('users');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function readRaw(uid: string): Promise<OfflineRecord> {
  if (typeof indexedDB === 'undefined') return memory.get(uid) ?? blank();
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database.transaction('users', 'readonly').objectStore('users').get(uid);
    request.onsuccess = () => resolve((request.result as OfflineRecord | undefined) ?? blank());
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(uid: string, fn: (record: OfflineRecord) => [OfflineRecord, T]): Promise<T> {
  if (typeof indexedDB === 'undefined') {
    const [next, result] = fn(memory.get(uid) ?? blank());
    memory.set(uid, next);
    publish(uid, next);
    return result;
  }
  const database = await db();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction('users', 'readwrite');
    const store = transaction.objectStore('users');
    const request = store.get(uid);
    let next: OfflineRecord;
    let result: T;
    request.onsuccess = () => {
      try {
        [next, result] = fn((request.result as OfflineRecord | undefined) ?? blank());
        store.put(next, uid);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };
    transaction.oncomplete = () => { publish(uid, next); resolve(result); };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function readOffline(uid: string): Promise<OfflineRecord> {
  await pending.get(uid)?.catch(() => {});
  const record = await readRaw(uid);
  publish(uid, record);
  return record;
}

export function updateOffline<T>(uid: string, fn: (record: OfflineRecord) => [OfflineRecord, T]): Promise<T> {
  const work = (pending.get(uid) ?? Promise.resolve()).catch(() => {}).then(async () => {
    return transact(uid, fn); // caller only sees success after the IDB transaction commits
  });
  pending.set(uid, work);
  void work.finally(() => { if (pending.get(uid) === work) pending.delete(uid); }).catch(() => {});
  return work;
}
