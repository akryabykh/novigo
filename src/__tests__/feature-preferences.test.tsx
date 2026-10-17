import { expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { FeaturePreferencesProvider, launchTab, parseFeaturePreferences, useFeaturePreferences } from '../features/preferences/FeaturePreferences';

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

test('bottom tabs stay between two and four icons and restore their saved order', async () => {
  mockValues.clear();
  let settings!: ReturnType<typeof useFeaturePreferences>;
  function Harness() { settings = useFeaturePreferences(); return null; }
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<FeaturePreferencesProvider><Harness /></FeaturePreferencesProvider>); });
  expect(settings.preferences.tabs).toEqual(['tasks', 'counter']);
  await act(async () => { await settings.save({ tabs: ['counter', 'tasks', 'goals'] }); });
  expect(settings.preferences.tabs).toEqual(['counter', 'tasks', 'goals']);
  await act(async () => { tree.unmount(); });
  await act(async () => { tree = create(<FeaturePreferencesProvider><Harness /></FeaturePreferencesProvider>); });
  expect(settings.ready).toBe(true);
  expect(settings.preferences.tabs).toEqual(['counter', 'tasks', 'goals']);
  await act(async () => { tree.unmount(); });
});

test('one tool plus Profile is valid; empty or four tools cannot be saved', async () => {
  mockValues.clear();
  let settings!: ReturnType<typeof useFeaturePreferences>;
  function Harness() { settings = useFeaturePreferences(); return null; }
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<FeaturePreferencesProvider><Harness /></FeaturePreferencesProvider>); });
  await act(async () => { await settings.save({ tabs: ['counter'] }); });
  expect(launchTab(settings.preferences.tabs)).toBe('counter');
  await expect(settings.save({ tabs: [] })).rejects.toThrow();
  await expect(settings.save({ tabs: ['tasks', 'goals', 'counter', 'stopwatch'] })).rejects.toThrow();
  expect(settings.preferences.tabs).toEqual(['counter']);
  await act(async () => { tree.unmount(); });
});

test('previous Goals switch is migrated into the new tab selection', () => {
  expect(parseFeaturePreferences('{"showGoals":true}').tabs).toEqual(['tasks', 'goals', 'counter']);
  expect(parseFeaturePreferences('{"showGoals":false}').tabs).toEqual(['tasks', 'counter']);
});
