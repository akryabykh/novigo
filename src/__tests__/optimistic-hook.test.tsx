import { jest, test, expect } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOptimisticLog } from '../features/calendar/useOptimisticLog';
import { qk } from '../core/query';
import { queueLogs } from '../features/offline/sync';

jest.mock('../features/offline/sync', () => ({ queueLogs: jest.fn() }));
jest.mock('../core/data', () => ({ upsertLogs: jest.fn() }));
jest.mock('../features/queries', () => ({ syncGamificationSafe: jest.fn() }));
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test('a progress edit survives component unmount', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  qc.setQueryData(qk.workspace('u1'), { goals: [], logs: [] });
  let finish!: () => void;
  jest.mocked(queueLogs).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  let api!: ReturnType<typeof useOptimisticLog>;
  function Harness() { api = useOptimisticLog('u1'); return null; }
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>); });
  let saved!: Promise<void>;
  await act(async () => { saved = api.logValue('g', '2026-09-26', 1); });
  await act(async () => { root.unmount(); });
  expect(queueLogs).toHaveBeenCalledWith('u1', [{ goalId: 'g', date: '2026-09-26', value: 1, expectedValue: 0 }], qc);
  await act(async () => { finish(); await saved; });
  expect(qc.getQueryData(qk.workspace('u1'))).toEqual({ goals: [], logs: [{ goalId: 'g', date: '2026-09-26', value: 1 }] });
  qc.clear();
});
