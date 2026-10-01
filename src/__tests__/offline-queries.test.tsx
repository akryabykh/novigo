import { jest, test, expect, afterEach } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useSaveGoals, useWorkspace } from '../features/queries';
import { loadOfflineWorkspace, queueHorizon } from '../features/offline/sync';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('../core/data', () => ({}));
jest.mock('../features/offline/sync', () => ({ loadOfflineWorkspace: jest.fn(), queueHorizon: jest.fn() }));
jest.mock('../features/offline/store', () => ({ readOffline: jest.fn(), updateOffline: jest.fn() }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  onlineManager.setOnline(true);
  jest.clearAllMocks();
});

test('a task save enters the local queue while offline instead of waiting for the network', async () => {
  onlineManager.setOnline(false);
  jest.mocked(queueHorizon).mockResolvedValue(undefined);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let save!: ReturnType<typeof useSaveGoals>;
  function Harness() { save = useSaveGoals('u1', 'task', 'day', '2026-10-01'); return null; }
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>); });

  const input = { updates: [], creates: [{
    kind: 'task' as const, title: 'Добраться до отеля', timeframe: 'day' as const,
    target: 1, weight: 100, startDate: '2026-10-01', endDate: null,
  }], deletes: [] };
  let saving!: Promise<void>;
  await act(async () => {
    saving = save.mutateAsync(input);
    await Promise.resolve();
  });
  expect(queueHorizon).toHaveBeenCalledWith('u1', 'task', 'day', '2026-10-01', input, qc);
  expect(save.isPaused).toBe(false);
  await act(async () => { await saving; });
  expect(save.isSuccess).toBe(true);
  await act(async () => { root.unmount(); });
  qc.clear();
});

test('workspace reads its local snapshot while offline', async () => {
  onlineManager.setOnline(false);
  jest.mocked(loadOfflineWorkspace).mockResolvedValue({ goals: [], logs: [] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let workspace!: ReturnType<typeof useWorkspace>;
  function Harness() { workspace = useWorkspace('u1'); return null; }
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>); });

  expect(loadOfflineWorkspace).toHaveBeenCalledWith('u1', qc);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(workspace.data).toEqual({ goals: [], logs: [] });
  await act(async () => { root.unmount(); });
  qc.clear();
});
