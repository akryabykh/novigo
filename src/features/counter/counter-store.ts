import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CounterSnapshot {
  id: string;
  value: number;
  savedAt: string;
}

export interface CounterState {
  value: number;
  snapshots: CounterSnapshot[];
}

export const EMPTY_COUNTER: CounterState = { value: 0, snapshots: [] };

export function formatCounterValue(value: number): string {
  return String(value).padStart(4, '0');
}

const cache = new Map<string, CounterState>();
const writes = new Map<string, Promise<void>>();
const keyFor = (uid: string) => `novigo.counter.${uid}`;

function validCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseCounter(raw: string | null): CounterState {
  if (!raw) return EMPTY_COUNTER;
  try {
    const stored: unknown = JSON.parse(raw);
    if (!stored || typeof stored !== 'object') return EMPTY_COUNTER;
    const record = stored as Partial<CounterState>;
    return {
      value: validCount(record.value) ? record.value : 0,
      snapshots: Array.isArray(record.snapshots) ? record.snapshots.filter((item): item is CounterSnapshot =>
        item && typeof item.id === 'string' && validCount(item.value)
          && typeof item.savedAt === 'string' && !Number.isNaN(Date.parse(item.savedAt))) : [],
    };
  } catch { return EMPTY_COUNTER; }
}

export function adjustCounter(state: CounterState, delta: -1 | 1): CounterState {
  if (delta < 0 && state.value === 0) return state;
  if (delta > 0 && state.value === Number.MAX_SAFE_INTEGER) return state;
  return { ...state, value: state.value + delta };
}

export async function loadCounter(uid: string): Promise<CounterState> {
  await writes.get(uid)?.catch(() => {});
  const cached = cache.get(uid);
  if (cached) return cached;
  const state = parseCounter(await AsyncStorage.getItem(keyFor(uid)));
  cache.set(uid, state);
  return state;
}

export function persistCounter(uid: string, state: CounterState): Promise<void> {
  cache.set(uid, state);
  const next = (writes.get(uid) ?? Promise.resolve())
    .catch(() => {})
    .then(() => AsyncStorage.setItem(keyFor(uid), JSON.stringify(state)));
  writes.set(uid, next);
  void next.finally(() => { if (writes.get(uid) === next) writes.delete(uid); }).catch(() => {});
  return next;
}
