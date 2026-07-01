// Supabase client (web + native). Session persisted via AsyncStorage.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

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
});
