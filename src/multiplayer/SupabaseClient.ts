import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SafeStorage } from '../services/SafeStorage';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://fgouwmigftxgnwjcpcot.supabase.co';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb3V3bWlnZnR4Z253amNwY290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDI2NDIsImV4cCI6MjEwNTgxODY0Mn0.h_Xj3XiPCrVKMTu8kwRyP8hsyIgprVqKtdN3voRVg1c';

const rawKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_ANON_KEY =
  rawKey && rawKey !== 'YOUR_ANON_KEY' && rawKey !== 'YOUR_PUBLISHABLE_KEY'
    ? rawKey
    : FALLBACK_ANON_KEY;

let clientInstance: SupabaseClient | null = null;

const safeAuthStorage = {
  getItem: (key: string) => SafeStorage.getItem(key),
  setItem: (key: string, value: string) => SafeStorage.setItem(key, value),
  removeItem: (key: string) => SafeStorage.removeItem(key),
};

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY' &&
    SUPABASE_ANON_KEY !== 'YOUR_PUBLISHABLE_KEY'
  );
};

export const getSupabaseClient = (): SupabaseClient => {
  if (clientInstance) return clientInstance;

  // If anon key is missing, initialize with dummy key to prevent runtime throw, and warn
  const key = isSupabaseConfigured() ? SUPABASE_ANON_KEY : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

  clientInstance = createClient(SUPABASE_URL, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: safeAuthStorage,
    },
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  });

  return clientInstance;
};
