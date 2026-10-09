import type { Profile, GoalKind, Timeframe } from '../../core/domain';
import type { SaveHorizonInput } from '../../core/data';
import type { Workspace } from '../queries';
import type { LogInput } from '../calendar/log-cache';

export type StoredLog = LogInput & { expectedValue: number };
export type OfflineOperation =
  | { id: string; type: 'horizon'; userId: string; kind: GoalKind; timeframe: Timeframe; refDate: string; expectedRevision: number; input: SaveHorizonInput }
  | { id: string; type: 'move'; taskId: string; from: Timeframe; to: Timeframe; startDate: string; endDate: string;
      expectedSourceRevision: number; expectedDestinationRevision: number }
  | { id: string; type: 'logs'; changes: StoredLog[] };

export interface OfflineRecord {
  updatedAt?: number;
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
let dbUnavailable = false;
let status: Record<string, { pending: number; conflict: boolean; error: string | null }> = {};
const emptyStatus = { pending: 0, conflict: false, error: null };
const backupKey = (uid: string) => `novigo.offline.${uid}`;

function readBackup(uid: string): OfflineRecord {
  if (typeof localStorage === 'undefined') return memory.get(uid) ?? blank();
  const raw = localStorage.getItem(backupKey(uid));
  return raw ? JSON.parse(raw) as OfflineRecord : blank();
}

/** Synchronous boot snapshot; the durable IndexedDB copy is checked in the background. */
export function peekOffline(uid: string): OfflineRecord | null {
  try {
    const record = readBackup(uid);
    if (record.workspace && (!Array.isArray(record.workspace.goals) || !Array.isArray(record.workspace.logs))) return null;
    return { ...record, operations: Array.isArray(record.operations) ? record.operations : [] };
  } catch {
    return null;
  }
}

function latestRecord(primary: OfflineRecord | undefined, uid: string): OfflineRecord {
  let backup: OfflineRecord | undefined;
  try { backup = readBackup(uid); } catch { /* IndexedDB may still be available. */ }
  if (!primary) return backup ?? blank();
  return (backup?.updatedAt ?? 0) > (primary.updatedAt ?? 0) ? backup! : primary;
}

function stamp(record: OfflineRecord, previous: OfflineRecord): OfflineRecord {
  return { ...record, updatedAt: Math.max(Date.now(), (previous.updatedAt ?? 0) + 1) };
}

function writeBackup(uid: string, record: OfflineRecord): void {
  if (typeof localStorage === 'undefined') {
    if (typeof document !== 'undefined') throw new Error('Хранилище на устройстве недоступно');
    memory.set(uid, record);
    return;
  }
  localStorage.setItem(backupKey(uid), JSON.stringify(record));
}

export const subscribeOffline = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getOfflineStatus = (uid: string) => status[uid] ?? emptyStatus;
function publish(uid: string, record: OfflineRecord) {
  status = { ...status, [uid]: { pending: record.operations.length, conflict: !!record.conflictId, error: record.error } };
  listeners.forEach((fn) => fn());
}

function db(): Promise<IDBDatabase> {
  if (dbUnavailable) return Promise.reject(new Error('IndexedDB недоступна'));
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('novigo-offline', 1);
    let settled = false;
    const timer = setTimeout(() => finish(new Error('Хранилище долго не отвечает')), 5000);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) { dbUnavailable = true; reject(error); }
      else resolve(request.result);
    };
    request.onupgradeneeded = () => request.result.createObjectStore('users');
    request.onsuccess = () => { if (settled) request.result.close(); else finish(); };
    request.onerror = () => finish(request.error ?? new Error('Не удалось открыть хранилище'));
    request.onblocked = () => finish(new Error('Хранилище занято другой вкладкой'));
  });
  return dbPromise;
}

async function readRaw(uid: string): Promise<OfflineRecord> {
  if (typeof indexedDB === 'undefined' || dbUnavailable) return readBackup(uid);
  try {
    const database = await db();
    return await new Promise<OfflineRecord>((resolve, reject) => {
      const transaction = database.transaction('users', 'readonly');
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        try { transaction.abort(); } catch { /* Already inactive. */ }
        reject(new Error('Чтение долго не отвечает'));
      }, 5000);
      const request = transaction.objectStore('users').get(uid);
      request.onsuccess = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          const record = latestRecord(request.result as OfflineRecord | undefined, uid);
          try { writeBackup(uid, record); } catch { /* IndexedDB remains the primary copy. */ }
          resolve(record);
        } catch (error) { reject(error); }
      };
      request.onerror = () => { if (settled) return; settled = true; clearTimeout(timer); reject(request.error); };
    });
  } catch {
    dbUnavailable = true;
    return readBackup(uid);
  }
}

async function transact<T>(uid: string, fn: (record: OfflineRecord) => [OfflineRecord, T]): Promise<T> {
  const fallback = () => {
    const current = readBackup(uid);
    const [value, result] = fn(current);
    const next = stamp(value, current);
    writeBackup(uid, next);
    publish(uid, next);
    return result;
  };
  if (typeof indexedDB === 'undefined' || dbUnavailable) return fallback();
  let fnError: unknown;
  try {
    const database = await db();
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction('users', 'readwrite');
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        try { transaction.abort(); } catch { /* Already inactive. */ }
        reject(new Error('Сохранение долго не отвечает'));
      }, 5000);
      const store = transaction.objectStore('users');
      const request = store.get(uid);
      let next: OfflineRecord;
      let result: T;
      request.onsuccess = () => {
        if (settled) return;
        try {
          const current = latestRecord(request.result as OfflineRecord | undefined, uid);
          const [value, output] = fn(current);
          next = stamp(value, current);
          result = output;
          store.put(next, uid);
        } catch (error) {
          fnError = error;
          settled = true;
          clearTimeout(timer);
          transaction.abort();
          reject(error);
        }
      };
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { writeBackup(uid, next); } catch { /* IndexedDB already committed. */ }
        publish(uid, next);
        resolve(result);
      };
      transaction.onerror = () => { if (settled) return; settled = true; clearTimeout(timer); reject(transaction.error); };
      transaction.onabort = () => { if (settled) return; settled = true; clearTimeout(timer); reject(transaction.error); };
    });
  } catch {
    // Validation errors from fn must reach the caller; only storage failure uses the backup.
    if (fnError !== undefined) throw fnError;
    dbUnavailable = true;
    return fallback();
  }
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
