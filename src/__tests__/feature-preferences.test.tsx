import { expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { FeaturePreferencesProvider, useFeaturePreferences } from '../features/preferences/FeaturePreferences';

const mockValues = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockValues.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockValues.set(key, value); },
  },
}));
jest.mock('../features/auth/auth-provider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test('goals stay hidden by default and appear only after saved preference is restored', async () => {
  mockValues.clear();
  let settings!: ReturnType<typeof useFeaturePreferences>;
  function Harness() { settings = useFeaturePreferences(); return null; }
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<FeaturePreferencesProvider><Harness /></FeaturePreferencesProvider>); });
  expect(settings.preferences.showGoals).toBe(false);
  expect(settings.preferences.showStatistics).toBe(false);
  expect(settings.preferences.showCounter).toBe(false);
  await act(async () => { await settings.save({ showGoals: true, showStatistics: true, showCounter: true }); });
  expect(settings.preferences.showGoals).toBe(true);
  expect(settings.preferences.showStatistics).toBe(true);
  expect(settings.preferences.showCounter).toBe(true);
  await act(async () => { tree.unmount(); });
  await act(async () => { tree = create(<FeaturePreferencesProvider><Harness /></FeaturePreferencesProvider>); });
  expect(settings.ready).toBe(true);
  expect(settings.preferences.showGoals).toBe(true);
  expect(settings.preferences.showStatistics).toBe(true);
  expect(settings.preferences.showCounter).toBe(true);
  await act(async () => { tree.unmount(); });
});
