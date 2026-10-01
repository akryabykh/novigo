import { describe, test, expect, jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';
import { qk } from '../core/query';
import { LogWriter } from '../features/calendar/log-writer';
import type { Workspace } from '../features/queries';
import type { LogInput } from '../features/calendar/log-cache';
import { mkGoal } from './fixtures';

const v = (value: number, goalId = 'g'): LogInput => ({ goalId, date: '2026-09-26', value });
function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  const key = qk.workspace('u1');
  qc.setQueryData(key, { goals: [mkGoal({ id: 'g', timeframe: 'day' })], logs: [v(1)] });
  const requests: ReturnType<typeof deferred>[] = [];
  const write = jest.fn((_changes: LogInput[]) => { const d = deferred(); requests.push(d); return d.promise; });
  const saved = jest.fn();
  const invalidate = jest.spyOn(qc, 'invalidateQueries');
  const writer = new LogWriter(qc, 'u1', write, saved);
  const logs = () => qc.getQueryData<Workspace>(key)!.logs;
  return { qc, key, writer, requests, write, saved, invalidate, logs };
}

describe('ordered account progress writer', () => {
  test('serializes repeated edits and keeps the newest optimistic value until confirmed', async () => {
    const s = setup();
    const first = s.writer.enqueue([v(2)]);
    const second = s.writer.enqueue([v(3)]);
    await tick();
    expect(s.write).toHaveBeenCalledTimes(1);
    expect(s.logs()).toEqual([v(3)]);
    s.requests[0].resolve();
    await tick();
    expect(s.write).toHaveBeenCalledTimes(2);
    expect(s.logs()).toEqual([v(3)]);
    expect(s.invalidate).not.toHaveBeenCalled();
    s.requests[1].resolve();
    await Promise.all([first, second]);
    expect(s.logs()).toEqual([v(3)]);
    expect(s.saved).toHaveBeenCalledTimes(1);
    expect(s.invalidate).toHaveBeenCalledTimes(1);
    s.qc.clear();
  });

  test.each([true, false])('a failed edit rolls back only its date, first fails=%s', async (firstFails) => {
    const s = setup();
    const first = s.writer.enqueue([v(2)]);
    const second = s.writer.enqueue([v(1, 'other')]);
    await tick();
    if (firstFails) s.requests[0].reject(new Error('offline')); else s.requests[0].resolve();
    await tick();
    expect(s.logs()).toContainEqual(v(1, 'other'));
    if (firstFails) s.requests[1].resolve(); else s.requests[1].reject(new Error('offline'));
    await Promise.all([first, second]);
    expect(s.logs()).toEqual(firstFails ? [v(1), v(1, 'other')] : [v(2)]);
    expect(s.writer.getSnapshot().error?.message).toBe('offline');
    s.qc.clear();
  });

  test('two failures on the same date restore server value, not failed optimistic value', async () => {
    const s = setup();
    const a = s.writer.enqueue([v(2)]), b = s.writer.enqueue([v(3)]);
    await tick(); s.requests[0].reject(new Error('one'));
    await tick(); expect(s.logs()).toEqual([v(3)]);
    s.requests[1].reject(new Error('two'));
    await Promise.all([a, b]);
    expect(s.logs()).toEqual([v(1)]);
    s.qc.clear();
  });

  test('workspace reads preserve pending values without replacing unrelated goals', async () => {
    const s = setup();
    const done = s.writer.enqueue([v(2)]);
    const fetched = { goals: [mkGoal({ id: 'new', timeframe: 'day' })], logs: [v(1), v(4, 'untouched')] };
    const overlaid = s.writer.overlay(fetched);
    expect(overlaid.goals).toBe(fetched.goals);
    expect(overlaid.logs).toContainEqual(v(2));
    expect(overlaid.logs).toContainEqual(v(4, 'untouched'));
    s.qc.setQueryData(s.key, overlaid);
    await tick(); s.requests[0].reject(new Error('offline')); await done;
    expect(s.qc.getQueryData<Workspace>(s.key)!.goals).toEqual(fetched.goals);
    expect(s.logs()).toContainEqual(v(4, 'untouched'));
    s.qc.clear();
  });

  test('multi-date task reset is one write and fully rolls back on failure', async () => {
    const s = setup();
    const old = { ...v(1), date: '2026-09-25' };
    s.qc.setQueryData(s.key, { goals: [], logs: [v(1), old] });
    const changes = [v(0), { ...old, value: 0 }];
    const done = s.writer.enqueue(changes);
    expect(s.logs()).toEqual([]);
    await tick();
    expect(s.write).toHaveBeenCalledWith(changes);
    s.requests[0].reject(new Error('offline')); await done;
    expect(s.logs()).toEqual([v(1), old]);
    s.qc.clear();
  });
});
