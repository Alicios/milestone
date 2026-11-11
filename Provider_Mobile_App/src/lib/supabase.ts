import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { createChunkedStorage, type KeyValueStore } from './secureStorage';

const nativeStore: KeyValueStore = {
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  removeItem: key => SecureStore.deleteItemAsync(key),
};
// Browser previews deliberately do not persist provider sessions.
const memory = new Map<string, string>();
const webStore: KeyValueStore = {
  getItem: async key => memory.get(key) ?? null,
  setItem: async (key, value) => { memory.set(key, value); },
  removeItem: async key => { memory.delete(key); },
};
export const sessionStorage = createChunkedStorage(Platform.OS === 'web' ? webStore : nativeStore);
export const storageKey = 'milestone-provider-session';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const isConfigured = Boolean(url && key && !url.includes('your-project') && !key.startsWith('your-'));
export const supabase = createClient(url || 'https://unconfigured.supabase.co', key || 'unconfigured', {
  auth: { storage: sessionStorage, storageKey, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
