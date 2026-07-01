// Supabase client (web + native). Session persisted via AsyncStorage.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Free-tier Supabase compute sleeps when idle; the first request after a pause can
// stall until the DB wakes. The default fetch waits forever, so a single stalled
// request hangs the whole screen on skeletons (browser only gives up after ~2 min).
// Abort at 10s so react-query can fail fast and retry into the now-awake DB.
const FETCH_TIMEOUT_MS = 10_000;

const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const external = init?.signal;
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

/** False until real Supabase credentials are present in .env. Drives a setup screen. */
export const isSupabaseConfigured =
  !!url && !!anonKey && !url.includes('YOUR-PROJECT-REF') && !anonKey.includes('YOUR-ANON');

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // On web we must read the recovery/confirm token from the URL hash.
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
    // No-op lock: the default navigator.locks-based lock can deadlock on web
    // (auth + queries hang forever). We run single-user, so cross-tab locking
    // isn't needed — just run the operation.
    lock: (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => fn(),
  },
  global: { fetch: fetchWithTimeout },
});
