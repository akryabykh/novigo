import { describe, expect, test } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';

import { qk } from '../core/query';
import { applyLog } from '../features/calendar/log-cache';
import type { Workspace } from '../features/queries';
import { log } from './fixtures';

describe('applyLog (pure optimistic patch)', () => {
  const base: Workspace = { goals: [], logs: [log('g', '2024-06-10', 2)] };

  test('replaces an existing goal+date value', () => {
    expect(applyLog(base, { goalId: 'g', date: '2024-06-10', value: 5 }).logs).toEqual([log('g', '2024-06-10', 5)]);
  });
  test('adds a new log for a different date', () => {
    expect(applyLog(base, { goalId: 'g', date: '2024-06-11', value: 1 }).logs).toHaveLength(2);
  });
  test('value<=0 removes the log', () => {
    expect(applyLog(base, { goalId: 'g', date: '2024-06-10', value: 0 }).logs).toEqual([]);
  });
});

describe('optimistic update + rollback through the query cache', () => {
  test('a failed write rolls the cache back to the server snapshot', () => {
    const qc = new QueryClient();
    const key = qk.workspace('u1');
    const server: Workspace = { goals: [], logs: [log('g', '2024-06-10', 2)] };
    qc.setQueryData(key, server);

    // 1) snapshot the server truth (as onMutate does)
    const snapshot = qc.getQueryData<Workspace>(key);
    // 2) optimistic update
    qc.setQueryData<Workspace>(key, (prev) => (prev ? applyLog(prev, { goalId: 'g', date: '2024-06-10', value: 5 }) : prev));
    expect(qc.getQueryData<Workspace>(key)!.logs[0].value).toBe(5);
    // 3) write fails → rollback to snapshot
    qc.setQueryData(key, snapshot);
    expect(qc.getQueryData<Workspace>(key)!.logs[0].value).toBe(2);

    qc.clear();
  });
});
