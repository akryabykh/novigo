import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '../auth/auth-provider';

export type FeatureTab = 'tasks' | 'goals' | 'counter' | 'stopwatch';
export const FEATURE_TABS: FeatureTab[] = ['tasks', 'goals', 'counter', 'stopwatch'];
export const FEATURE_TAB_LABELS: Record<FeatureTab, string> = {
  tasks: 'Задачи', goals: 'Цели', counter: 'Счётчик', stopwatch: 'Секундомер',
};

type Preferences = { tabs: FeatureTab[] };
const DEFAULTS: Preferences = { tabs: ['tasks', 'counter'] };

export function parseFeaturePreferences(raw: string | null): Preferences {
  if (!raw) return DEFAULTS;
  try {
    const stored = JSON.parse(raw) as { tabs?: unknown; showGoals?: unknown };
    if (Array.isArray(stored.tabs)) {
      const tabs = stored.tabs.filter((tab, index, all): tab is FeatureTab =>
        FEATURE_TABS.includes(tab as FeatureTab) && all.indexOf(tab) === index).slice(0, 3);
      if (tabs.length) return { tabs };
    }
    // Migrate the previous Goals toggle without hiding the existing tools.
    return { tabs: stored.showGoals === true ? ['tasks', 'goals', 'counter'] : DEFAULTS.tabs };
  } catch { return DEFAULTS; }
}

export function launchTab(tabs: FeatureTab[]): FeatureTab {
  return tabs.includes('tasks') ? 'tasks' : tabs[0] ?? 'tasks';
}
const Context = createContext<{
  preferences: Preferences;
  ready: boolean;
  save: (next: Preferences) => Promise<void>;
} | null>(null);

export function FeaturePreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id;
  const [loaded, setLoaded] = useState<{ uid: string; preferences: Preferences } | null>(null);
  const preferences = loaded && loaded.uid === uid ? loaded.preferences : DEFAULTS;
  const ready = !uid || loaded?.uid === uid;

  useEffect(() => {
    let active = true;
    if (!uid) return;
    AsyncStorage.getItem(`novigo.preferences.${uid}`)
      .then((raw) => {
        if (!active) return;
        setLoaded({ uid, preferences: parseFeaturePreferences(raw) });
      })
      .catch(() => { if (active) setLoaded({ uid, preferences: DEFAULTS }); });
    return () => { active = false; };
  }, [uid]);

  const save = async (next: Preferences) => {
    if (!uid) throw new Error('Войди в аккаунт');
    const tabs = next.tabs;
    if (tabs.length < 1 || tabs.length > 3 || new Set(tabs).size !== tabs.length ||
      tabs.some((tab) => !FEATURE_TABS.includes(tab))) {
      throw new Error('Выбери от одного до трёх разделов');
    }
    const merged = { tabs: [...tabs] };
    await AsyncStorage.setItem(`novigo.preferences.${uid}`, JSON.stringify(merged));
    setLoaded({ uid, preferences: merged });
  };

  return <Context.Provider value={{ preferences, ready, save }}>{children}</Context.Provider>;
}

export function useFeaturePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error('FeaturePreferencesProvider is missing');
  return value;
}
