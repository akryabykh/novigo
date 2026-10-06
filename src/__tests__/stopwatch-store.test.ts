import { expect, jest, test } from '@jest/globals';
import { changeStopwatch, elapsedMs, finishSession, formatDuration, mergeStopwatch,
  pauseSession, readStopwatch, startSession } from '../features/stopwatch/stopwatch-store';

const mockValues = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockValues.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockValues.set(key, value); },
  },
}));

test('running time survives a paused app because it uses stored wall-clock timestamps', () => {
  const active = startSession('task-1', 'Написать план', new Date('2026-10-06T10:00:00.000Z'));
  expect(elapsedMs(active, Date.parse('2026-10-06T10:05:30.000Z'))).toBe(330_000);
  const paused = pauseSession(active, new Date('2026-10-06T10:05:30.000Z'));
  expect(elapsedMs(paused, Date.parse('2026-10-06T11:00:00.000Z'))).toBe(330_000);
  expect(finishSession(paused, new Date('2026-10-06T11:00:00.000Z')).durationMs).toBe(330_000);
  expect(formatDuration(330_000)).toBe('00:05:30');
});

test('completed session stays in the local queue until acknowledged by the server', async () => {
  const uid = 'stopwatch-test-user';
  const active = startSession(null, 'Работа', new Date('2026-10-06T10:00:00.000Z'));
  await changeStopwatch(uid, (before) => ({ ...before, active }));
  const finished = finishSession(active, new Date('2026-10-06T10:01:00.000Z'));
  await changeStopwatch(uid, (before) => ({ ...before, active: null,
    sessions: [finished, ...before.sessions], pending: [...before.pending, finished] }));
  const merged = await mergeStopwatch(uid, [finished], [finished.id]);
  expect(merged.active).toBeNull();
  expect(merged.sessions).toHaveLength(1);
  expect(merged.pending).toHaveLength(0);
  expect((await readStopwatch(uid)).sessions[0].durationMs).toBe(60_000);
  expect(JSON.parse(mockValues.get(`novigo.stopwatch.${uid}`)!).pending).toHaveLength(0);
});
