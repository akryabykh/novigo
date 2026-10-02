import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '../auth/auth-provider';

type Preferences = { showGoals: boolean; showStatistics: boolean };
const DEFAULTS: Preferences = { showGoals: false, showStatistics: false };
const Context = createContext<{
  preferences: Preferences;
  ready: boolean;
  save: (next: Partial<Preferences>) => Promise<void>;
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
        const stored = raw ? JSON.parse(raw) as Partial<Preferences> : null;
        setLoaded({ uid, preferences: {
          showGoals: stored?.showGoals === true,
          showStatistics: stored?.showStatistics === true,
        } });
      })
      .catch(() => { if (active) setLoaded({ uid, preferences: DEFAULTS }); });
    return () => { active = false; };
  }, [uid]);

  const save = async (next: Partial<Preferences>) => {
    if (!uid) throw new Error('Войди в аккаунт');
    const merged = { ...preferences, ...next };
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
