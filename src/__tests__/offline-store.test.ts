import { afterAll, expect, jest, test } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { QueryClient } from '@tanstack/react-query';

import { qk } from '../core/query';
import { queueHorizon } from '../features/offline/sync';
import { readOffline } from '../features/offline/store';

jest.mock('../core/data', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('../features/gamification/sync', () => ({ syncGamification: jest.fn() }));

const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

afterAll(() => {
  for (const [key, descriptor] of [
    ['indexedDB', originalIndexedDb], ['localStorage', originalLocalStorage],
    ['navigator', originalNavigator], ['crypto', originalCrypto],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('an IndexedDB open that hangs falls back to durable local storage', async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => ({}) } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  const uid = '55555555-5555-4555-8555-555555555555';
  const qc = new QueryClient();
  qc.setQueryData(qk.workspace(uid), { goals: [], logs: [], revisions: { 'task:day': 0 } });
  jest.useFakeTimers();
  try {
    const saving = queueHorizon(uid, 'task', 'day', '2026-10-01', { updates: [], creates: [{
      kind: 'task', timeframe: 'day', title: 'Задача офлайн', target: 1, weight: 100,
      startDate: '2026-10-01', endDate: '2026-10-01',
    }], deletes: [] }, qc);
    await jest.advanceTimersByTimeAsync(5000);
    await saving;
    expect(values.has(`novigo.offline.${uid}`)).toBe(true);
    const stored = await readOffline(uid);
    expect(stored.operations).toHaveLength(1);
    expect(stored.operations[0].type).toBe('horizon');
  } finally {
    jest.useRealTimers();
    qc.clear();
  }
});
