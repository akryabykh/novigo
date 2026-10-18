import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

import type { Timeframe } from '../../core/domain';
import { periodRange } from '../../core/logic';
import { qk } from '../../core/query';
import { fetchFamily, sendFamilyOperation, type FamilyOperation, type FamilySnapshot } from './family-data';
import { applyFamilyOperation, overlayFamily } from './family-logic';

interface StoredFamily {
  snapshot: FamilySnapshot | null;
  operations: FamilyOperation[];
  error: string | null;
}

export type FamilyView = FamilySnapshot & { pending: number; syncError: string | null };

const blank = (): StoredFamily => ({ snapshot: null, operations: [], error: null });
const memory = new Map<string, StoredFamily>();
const readers = new Map<string, Promise<StoredFamily>>();
const writers = new Map<string, Promise<unknown>>();
const active = new Map<string, Promise<void>>();
const key = (uid: string) => `novigo.family.${uid}`;
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

function uuid(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('На устройстве недоступен безопасный генератор ID');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  return [...bytes].map((byte, i) => `${[4, 6, 8, 10].includes(i) ? '-' : ''}${byte.toString(16).padStart(2, '0')}`).join('');
}

async function read(uid: string): Promise<StoredFamily> {
  if (memory.has(uid)) return memory.get(uid)!;
  if (!readers.has(uid)) readers.set(uid, (async () => {
    try {
      const raw = await AsyncStorage.getItem(key(uid));
      const parsed = raw ? JSON.parse(raw) as StoredFamily : blank();
      const value = { snapshot: parsed.snapshot ?? null, operations: Array.isArray(parsed.operations) ? parsed.operations : [], error: parsed.error ?? null };
      memory.set(uid, value);
      return value;
    } catch {
      const value = blank();
      memory.set(uid, value);
      return value;
    }
  })());
  return readers.get(uid)!;
}

async function change<T>(uid: string, fn: (current: StoredFamily) => [StoredFamily, T]): Promise<T> {
  const previous = writers.get(uid) ?? Promise.resolve();
  const work = previous.catch(() => {}).then(async () => {
    const current = await read(uid);
    const [next, result] = fn(current);
    await AsyncStorage.setItem(key(uid), JSON.stringify(next));
    memory.set(uid, next);
    return result;
  });
  writers.set(uid, work);
  try { return await work; }
  finally { if (writers.get(uid) === work) writers.delete(uid); }
}

function view(record: StoredFamily, uid: string): FamilyView {
  const snapshot = record.snapshot ?? { family: null, tasks: [] };
  return { ...overlayFamily(snapshot, record.operations, uid), pending: record.operations.length, syncError: record.error };
}

export async function loadFamilyView(uid: string): Promise<FamilyView> {
  const cached = await read(uid);
  if (!online()) {
    if (cached.snapshot) return view(cached, uid);
    throw new Error('Открой семейные задачи один раз с интернетом');
  }
  try {
    await synchronizeFamily(uid);
    const remote = await fetchFamily(uid);
    await change(uid, (record) => {
      const sameFamily = remote.family?.id === record.snapshot?.family?.id;
      return [{ ...record, snapshot: remote, operations: sameFamily ? record.operations : [],
        error: sameFamily && record.operations.length ? record.error : null }, undefined];
    });
    return view(await read(uid), uid);
  } catch (error) {
    if (cached.snapshot) return view(await read(uid), uid);
    throw error;
  }
}

export async function clearFamilyCache(uid: string): Promise<void> {
  await change(uid, () => [blank(), undefined]);
}

export async function discardFirstFamilyOperation(uid: string, qc: QueryClient): Promise<void> {
  await change(uid, (record) => [{ ...record, operations: record.operations.slice(1), error: null }, undefined]);
  await qc.invalidateQueries({ queryKey: qk.family(uid) });
}

export async function queueFamilyOperation(uid: string, input: {
  familyId: string;
  taskId?: string;
  action: FamilyOperation['action'];
  title?: string;
  timeframe?: Timeframe;
  date?: string;
  done?: boolean;
}, qc: QueryClient): Promise<void> {
  const op: FamilyOperation = {
    id: uuid(), familyId: input.familyId, taskId: input.taskId ?? uuid(), action: input.action,
    title: input.title?.trim() ?? null, timeframe: input.timeframe ?? null,
    periodStart: input.timeframe && input.date ? periodRange(input.timeframe, input.date).start : null,
    done: input.done ?? null, requestedAt: new Date().toISOString(),
  };
  if (op.action === 'create' && (!op.title || op.title.length > 200 || !op.timeframe || !op.periodStart)) {
    throw new Error('Введите название задачи до 200 символов');
  }
  await change(uid, (record) => {
    if (!record.snapshot?.family || record.snapshot.family.id !== input.familyId) throw new Error('Сначала открой семейные задачи');
    const current = overlayFamily(record.snapshot, record.operations, uid);
    if (op.action !== 'create' && !current.tasks.some((task) => task.id === op.taskId)) throw new Error('Задача уже удалена');
    return [{ ...record, operations: [...record.operations, op], error: null }, undefined];
  });
  qc.setQueryData<FamilyView>(qk.family(uid), (current) => current
    ? { ...applyFamilyOperation(current, op, uid), pending: current.pending + 1, syncError: null } : current);
  void synchronizeFamily(uid, qc);
}

export function synchronizeFamily(uid: string, qc?: QueryClient): Promise<void> {
  if (!online()) return Promise.resolve();
  if (active.has(uid)) return active.get(uid)!;
  const work = (async () => {
    while (online()) {
      const record = await read(uid);
      const op = record.operations[0];
      if (!op) break;
      try {
        await sendFamilyOperation(op);
        await change(uid, (current) => [{
          ...current,
          snapshot: current.snapshot ? applyFamilyOperation(current.snapshot, op, uid) : null,
          operations: current.operations.filter((item) => item.id !== op.id),
          error: null,
        }, undefined]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await change(uid, (current) => [{ ...current, error: message }, undefined]);
        break;
      }
    }
    if (qc) void qc.invalidateQueries({ queryKey: qk.family(uid) });
  })().finally(() => active.delete(uid));
  active.set(uid, work);
  return work;
}
