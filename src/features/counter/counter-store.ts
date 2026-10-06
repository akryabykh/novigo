import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CounterSnapshot { id: string; value: number; savedAt: string }
export interface CounterState { value: number; snapshots: CounterSnapshot[] }
export type CounterOperation =
  | { id: string; type: 'delta'; delta: number }
  | { id: string; type: 'reset' }
  | { id: string; type: 'snapshot'; value: number; savedAt: string }
  | { id: string; type: 'clear' };
export interface CounterRecord { version: 2; base: CounterState; pending: CounterOperation[] }

export const EMPTY_COUNTER: CounterState = { value: 0, snapshots: [] };
const emptyRecord = (): CounterRecord => ({ version: 2, base: EMPTY_COUNTER, pending: [] });
const cache = new Map<string, CounterRecord>();
const loads = new Map<string, Promise<CounterRecord>>();
const writes = new Map<string, Promise<void>>();
const keyFor = (uid: string) => `novigo.counter.${uid}`;
const validCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function newCounterOperationId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function formatCounterValue(value: number): string { return String(value).padStart(4, '0'); }

function parseState(value: unknown): CounterState {
  if (!value || typeof value !== 'object') return EMPTY_COUNTER;
  const record = value as Partial<CounterState>;
  return {
    value: validCount(record.value) ? record.value : 0,
    snapshots: Array.isArray(record.snapshots) ? record.snapshots.filter((item): item is CounterSnapshot =>
      item && typeof item.id === 'string' && validCount(item.value)
        && typeof item.savedAt === 'string' && !Number.isNaN(Date.parse(item.savedAt))) : [],
  };
}

function validOperation(value: unknown): value is CounterOperation {
  if (!value || typeof value !== 'object') return false;
  const op = value as Partial<CounterOperation>;
  if (typeof op.id !== 'string' || !op.id) return false;
  if (op.type === 'delta') return typeof op.delta === 'number' && Number.isSafeInteger(op.delta) && op.delta !== 0;
  if (op.type === 'snapshot') return validCount(op.value) && typeof op.savedAt === 'string' && !Number.isNaN(Date.parse(op.savedAt));
  return op.type === 'reset' || op.type === 'clear';
}

export function parseCounterRecord(raw: string | null): CounterRecord {
  if (!raw) return emptyRecord();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return emptyRecord();
    const record = value as Partial<CounterRecord>;
    if (record.version === 2) return {
      version: 2, base: parseState(record.base),
      pending: Array.isArray(record.pending) ? record.pending.filter(validOperation) : [],
    };
    // v1 existed only on this device. Import its value and saved history once.
    const legacy = parseState(value);
    return { version: 2, base: EMPTY_COUNTER, pending: [
      ...(legacy.value ? [{ id: newCounterOperationId(), type: 'delta' as const, delta: legacy.value }] : []),
      ...legacy.snapshots.slice().reverse().map((item) => ({
        id: newCounterOperationId(), type: 'snapshot' as const, value: item.value, savedAt: item.savedAt,
      })),
    ] };
  } catch { return emptyRecord(); }
}

export function applyCounterOperation(state: CounterState, operation: CounterOperation): CounterState {
  switch (operation.type) {
    case 'delta': return { ...state, value: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, state.value + operation.delta)) };
    case 'reset': return { ...state, value: 0 };
    case 'snapshot': return { ...state, snapshots: [
      { id: operation.id, value: operation.value, savedAt: operation.savedAt }, ...state.snapshots,
    ] };
    case 'clear': return { ...state, snapshots: [] };
  }
}

export function visibleCounter(record: CounterRecord): CounterState {
  return record.pending.reduce(applyCounterOperation, record.base);
}

export function adjustCounter(state: CounterState, delta: -1 | 1): CounterState {
  if (delta < 0 && state.value === 0) return state;
  if (delta > 0 && state.value === Number.MAX_SAFE_INTEGER) return state;
  return { ...state, value: state.value + delta };
}

function writeRecord(uid: string, record: CounterRecord): Promise<void> {
  const next = (writes.get(uid) ?? Promise.resolve()).catch(() => {})
    .then(() => AsyncStorage.setItem(keyFor(uid), JSON.stringify(record)));
  writes.set(uid, next);
  void next.finally(() => { if (writes.get(uid) === next) writes.delete(uid); }).catch(() => {});
  return next;
}

export async function loadCounterRecord(uid: string): Promise<CounterRecord> {
  const cached = cache.get(uid);
  if (cached) return cached;
  const ongoing = loads.get(uid);
  if (ongoing) return ongoing;
  const loading = (async () => {
    const raw = await AsyncStorage.getItem(keyFor(uid));
    const record = parseCounterRecord(raw);
    if (raw) {
      let version: unknown;
      try { version = (JSON.parse(raw) as { version?: number }).version; }
      catch { /* An invalid old record is replaced with a fresh one. */ }
      if (version !== 2) await writeRecord(uid, record);
    }
    cache.set(uid, record);
    return record;
  })();
  loads.set(uid, loading);
  try { return await loading; }
  finally { if (loads.get(uid) === loading) loads.delete(uid); }
}

export async function enqueueCounter(uid: string, operation: CounterOperation): Promise<CounterRecord> {
  await loadCounterRecord(uid);
  const current = cache.get(uid)!;
  const next = { ...current, pending: [...current.pending, operation] };
  cache.set(uid, next);
  await writeRecord(uid, next);
  return next;
}

export async function acknowledgeCounter(uid: string, sentIds: string[], server: CounterState): Promise<CounterRecord> {
  await loadCounterRecord(uid);
  const current = cache.get(uid)!;
  const ids = new Set(sentIds);
  const next: CounterRecord = { version: 2, base: server,
    pending: current.pending.filter((item) => !ids.has(item.id)) };
  cache.set(uid, next);
  await writeRecord(uid, next);
  return next;
}

export async function retryCounterWrite(uid: string): Promise<void> {
  await loadCounterRecord(uid);
  await writeRecord(uid, cache.get(uid)!);
}

export async function loadCounter(uid: string): Promise<CounterState> {
  return visibleCounter(await loadCounterRecord(uid));
}
