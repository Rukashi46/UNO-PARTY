import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SafeStorage } from '../services/SafeStorage';

const DEFAULT_SUPABASE_URL = 'https://fgouwmigftxgnwjcpcot.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb3V3bWlnZnR4Z253amNwY290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDI2NDIsImV4cCI6MjEwNTgxODY0Mn0.h_Xj3XiPCrVKMTu8kwRyP8hsyIgprVqKtdN3voRVg1c';

const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_URL =
  envUrl && (envUrl.startsWith('http://') || envUrl.startsWith('https://'))
    ? envUrl
    : DEFAULT_SUPABASE_URL;

const envKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_ANON_KEY =
  envKey && envKey !== 'EXPO_PUBLIC_SUPABASE_ANON_KEY' && envKey.trim().length > 10
    ? envKey
    : DEFAULT_SUPABASE_ANON_KEY;

let clientInstance: SupabaseClient | null = null;

if (__DEV__) {
  console.log(`[SUPABASE_INIT]\nSUPABASE_URL_PRESENT=${Boolean(SUPABASE_URL)}\nSUPABASE_ANON_KEY_PRESENT=${Boolean(SUPABASE_ANON_KEY)}`);
}

// Safe Storage adapter for Supabase Auth to prevent AsyncStorage unlinked exceptions
const SupabaseAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SafeStorage.getItem(key);
    } catch (_) {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SafeStorage.setItem(key, value);
    } catch (_) {}
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SafeStorage.removeItem(key);
    } catch (_) {}
  },
};

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    SUPABASE_URL &&
    (SUPABASE_URL.startsWith('http://') || SUPABASE_URL.startsWith('https://')) &&
    SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY !== 'EXPO_PUBLIC_SUPABASE_ANON_KEY'
  );
};

export const getSupabaseClient = (): SupabaseClient => {
  if (clientInstance) return clientInstance;

  try {
    clientInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: SupabaseAuthStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 20,
        },
      },
    });
  } catch (err) {
    console.warn('[SupabaseClient] Initialization fallback:', err);
    clientInstance = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, {
      auth: {
        storage: SupabaseAuthStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

  return clientInstance;
};
