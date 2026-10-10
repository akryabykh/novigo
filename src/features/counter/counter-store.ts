import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CounterSnapshot { id: string; value: number; savedAt: string }
export interface CounterItem { id: string; title: string; value: number; snapshots: CounterSnapshot[] }
export interface CounterCollection { counters: CounterItem[] }
export type CounterOperation =
  | { id: string; type: 'create'; counterId: string; title: string }
  | { id: string; type: 'delete'; counterId: string }
  | { id: string; type: 'delta'; counterId: string; delta: number }
  | { id: string; type: 'reset'; counterId: string }
  | { id: string; type: 'snapshot'; counterId: string; value: number; savedAt: string }
  | { id: string; type: 'clear'; counterId: string }
  | { id: string; type: 'rename'; counterId: string; title: string };
export interface CounterRecord {
  version: 3;
  base: CounterCollection;
  pending: CounterOperation[];
  selectedId: string | null;
}

export const DEFAULT_COUNTER_ID = 'default';
export const EMPTY_COUNTER: CounterItem = { id: DEFAULT_COUNTER_ID, title: 'Счётчик', value: 0, snapshots: [] };
export const EMPTY_COLLECTION: CounterCollection = { counters: [EMPTY_COUNTER] };
const emptyRecord = (): CounterRecord => ({ version: 3, base: EMPTY_COLLECTION, pending: [], selectedId: DEFAULT_COUNTER_ID });
const cache = new Map<string, CounterRecord>();
const loads = new Map<string, Promise<CounterRecord>>();
const writes = new Map<string, Promise<void>>();
const keyFor = (uid: string) => `novigo.counter.${uid}`;
const validCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const validTitle = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 60;

export function newCounterOperationId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function formatCounterValue(value: number): string { return String(value).padStart(4, '0'); }

function parseState(value: unknown, id: string): CounterItem {
  const record = value && typeof value === 'object' ? value as Partial<CounterItem> : {};
  return {
    id,
    title: validTitle(record.title) ? record.title.trim() : 'Счётчик',
    value: validCount(record.value) ? record.value : 0,
    snapshots: Array.isArray(record.snapshots) ? record.snapshots.filter((item): item is CounterSnapshot =>
      item && typeof item.id === 'string' && validCount(item.value)
        && typeof item.savedAt === 'string' && !Number.isNaN(Date.parse(item.savedAt))) : [],
  };
}

export function parseCounterCollection(value: unknown): CounterCollection {
  if (!value || typeof value !== 'object' || !Array.isArray((value as CounterCollection).counters)) {
    throw new Error('Сервер вернул неверное состояние счётчиков.');
  }
  const seen = new Set<string>();
  return { counters: (value as CounterCollection).counters.map((item) => {
    if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id)
      || !validTitle(item.title) || !validCount(item.value) || !Array.isArray(item.snapshots)) {
      throw new Error('Сервер вернул неверное состояние счётчиков.');
    }
    seen.add(item.id);
    return parseState(item, item.id);
  }) };
}

function validOperation(value: unknown): value is CounterOperation {
  if (!value || typeof value !== 'object') return false;
  const op = value as Partial<CounterOperation>;
  if (typeof op.id !== 'string' || !op.id || typeof op.counterId !== 'string' || !op.counterId) return false;
  if (op.type === 'create' || op.type === 'rename') return validTitle(op.title);
  if (op.type === 'delta') return typeof op.delta === 'number' && Number.isSafeInteger(op.delta) && op.delta !== 0;
  if (op.type === 'snapshot') return validCount(op.value) && typeof op.savedAt === 'string' && !Number.isNaN(Date.parse(op.savedAt));
  return op.type === 'reset' || op.type === 'clear' || op.type === 'delete';
}

export function parseCounterRecord(raw: string | null): CounterRecord {
  if (!raw) return emptyRecord();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return emptyRecord();
    const record = value as Partial<CounterRecord>;
    if (record.version === 3) return {
      version: 3, base: parseCounterCollection(record.base),
      pending: Array.isArray(record.pending) ? record.pending.filter(validOperation) : [],
      selectedId: typeof record.selectedId === 'string' ? record.selectedId : null,
    };
    if (record.version === 2) {
      const old = record as unknown as { base: unknown; pending?: Record<string, unknown>[] };
      return {
        version: 3, base: { counters: [parseState(old.base, DEFAULT_COUNTER_ID)] },
        pending: (old.pending ?? []).map((op) => ({ ...op, counterId: DEFAULT_COUNTER_ID })).filter(validOperation),
        selectedId: DEFAULT_COUNTER_ID,
      };
    }
    // v1 was device-only. Import its value and history once as pending actions.
    const legacy = parseState(value, DEFAULT_COUNTER_ID);
    return { version: 3, base: EMPTY_COLLECTION, selectedId: DEFAULT_COUNTER_ID, pending: [
      ...(legacy.value ? [{ id: newCounterOperationId(), type: 'delta' as const, counterId: DEFAULT_COUNTER_ID, delta: legacy.value }] : []),
      ...legacy.snapshots.slice().reverse().map((item) => ({
        id: newCounterOperationId(), type: 'snapshot' as const, counterId: DEFAULT_COUNTER_ID,
        value: item.value, savedAt: item.savedAt,
      })),
    ] };
  } catch { return emptyRecord(); }
}

export function applyCounterOperation(state: CounterCollection, operation: CounterOperation): CounterCollection {
  if (operation.type === 'create') {
    if (state.counters.some((item) => item.id === operation.counterId)) return state;
    return { counters: [...state.counters, { id: operation.counterId, title: operation.title.trim(), value: 0, snapshots: [] }] };
  }
  if (operation.type === 'delete') return { counters: state.counters.filter((item) => item.id !== operation.counterId) };
  return { counters: state.counters.map((item) => {
    if (item.id !== operation.counterId) return item;
    switch (operation.type) {
      case 'delta': return { ...item, value: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, item.value + operation.delta)) };
      case 'reset': return { ...item, value: 0 };
      case 'snapshot': return { ...item, snapshots: [
        { id: operation.id, value: operation.value, savedAt: operation.savedAt }, ...item.snapshots,
      ] };
      case 'clear': return { ...item, snapshots: [] };
      case 'rename': return { ...item, title: operation.title.trim() };
    }
  }) };
}

export function visibleCounters(record: CounterRecord): CounterCollection {
  return record.pending.reduce(applyCounterOperation, record.base);
}

export function selectedCounter(record: CounterRecord): CounterItem | null {
  const counters = visibleCounters(record).counters;
  return counters.find((item) => item.id === record.selectedId) ?? counters[0] ?? null;
}

export function adjustCounter(state: CounterItem, delta: -1 | 1): CounterItem {
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
      catch { /* Invalid old records are replaced with a fresh one. */ }
      if (version !== 3) await writeRecord(uid, record);
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
  const next = { ...current, pending: [...current.pending, operation],
    selectedId: operation.type === 'create' ? operation.counterId
      : operation.type === 'delete' && current.selectedId === operation.counterId
        ? visibleCounters(current).counters.find((item) => item.id !== operation.counterId)?.id ?? null
        : current.selectedId };
  cache.set(uid, next);
  await writeRecord(uid, next);
  return next;
}

export async function selectCounter(uid: string, counterId: string): Promise<CounterRecord> {
  const current = await loadCounterRecord(uid);
  if (!visibleCounters(current).counters.some((item) => item.id === counterId)) return current;
  const next = { ...current, selectedId: counterId };
  cache.set(uid, next);
  await writeRecord(uid, next);
  return next;
}

export async function acknowledgeCounter(uid: string, sentIds: string[], server: CounterCollection): Promise<CounterRecord> {
  await loadCounterRecord(uid);
  const current = cache.get(uid)!;
  const ids = new Set(sentIds);
  const next: CounterRecord = { version: 3, base: server, selectedId: current.selectedId,
    pending: current.pending.filter((item) => !ids.has(item.id)) };
  cache.set(uid, next);
  await writeRecord(uid, next);
  return next;
}

export async function retryCounterWrite(uid: string): Promise<void> {
  await loadCounterRecord(uid);
  await writeRecord(uid, cache.get(uid)!);
}
