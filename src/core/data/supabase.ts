// Supabase client (web + native). Session persisted via AsyncStorage.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Russian ISPs throttle Cloudflare (which fronts every *.supabase.co endpoint) to
// ~16KB per connection, so direct browser→Supabase requests stall / never complete.
// On the DEPLOYED web app we route Supabase through our own Vercel origin
// (/supabase-api → rewrite in vercel.json). Vercel is not behind Cloudflare, so the
// browser never connects to supabase.co directly; the Cloudflare hop happens
// server-side from Vercel's network, where there is no throttling.
// Native builds and local web dev (no rewrite) keep talking to Supabase directly.
function resolveClientUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if (!isLocal) return `${origin}/supabase-api`;
  }
  return url || 'https://placeholder.supabase.co';
}
const clientUrl = resolveClientUrl();

// Free-tier Supabase compute sleeps when idle; the first request after a pause can
// stall until the DB wakes. The default fetch waits forever, so a single stalled
// request hangs the whole screen on skeletons (browser only gives up after ~2 min).
// Abort at 8s so react-query can fail fast and retry into the now-awake DB.
const FETCH_TIMEOUT_MS = 8_000;

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

export const supabase = createClient(clientUrl, anonKey || 'placeholder', {
  auth: {
    storage: AsyncStorage,
    // Stable key so the session survives the web URL being the proxy origin
    // (otherwise supabase-js derives the key from the URL and they'd diverge).
    storageKey: 'sb-novigo-auth',
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
