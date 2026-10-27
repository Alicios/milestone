import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { fetchSharedPatientProfile } from '../lib/patientProfile';
import { createPatientSession, validateProfile } from './patientAccount';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { loadPatientSession, savePatientSession } from './patientStorage';
import { defaultPreferences, normalizePreferences, validReminder } from './preferences';
import { AppThemeProvider } from '../components/AppTheme';

export const PatientSessionContext = createContext(null);

export function PatientSessionProvider({ children, rememberPatient = true }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [storageWarning, setStorageWarning] = useState('');
  const [authError, setAuthError] = useState('');
  const authGeneration = useRef(0);
  const [profileWarning, setProfileWarning] = useState('');
  const [profileRefreshing, setProfileRefreshing] = useState(false);
  const refreshPending = useRef(false);
  const current = useRef(null);
  const writes = useRef(Promise.resolve());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    async function restore(authSession) {
      const generation = ++authGeneration.current;
      if (!authSession) {
        current.current = null;
        setSession(null);
        setLoading(false);
        return;
      }
      if (current.current?.profile.id === authSession.user.id) return;
      setLoading(true);
      try {
        const shared = await fetchSharedPatientProfile();
        const saved = rememberPatient ? await loadPatientSession(authSession.user.id) : null;
        if (!active || generation !== authGeneration.current) return;
        const next = saved && saved.profile.databasePatientId === shared.databasePatientId
          ? { ...saved, profile: { ...saved.profile, ...shared }, preferences: normalizePreferences(saved.preferences) }
          : createPatientSession({ ...shared, id: authSession.user.id });
        current.current = next;
        setSession(next);
        setAuthError('');
      } catch (error) {
        if (active && generation === authGeneration.current) {
          current.current = null;
          setSession(null);
          setAuthError(error.message || 'Unable to load your patient account.');
        }
      } finally {
        if (active && generation === authGeneration.current) setLoading(false);
      }
    }
    if (!isSupabaseConfigured) {
      setAuthError('Patient sign-in is unavailable. Configure Supabase and restart the app.');
      setLoading(false);
      return () => { active = false; mounted.current = false; };
    }
    // Schedule API calls outside the Auth callback to avoid holding its session lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, value) => {
      setTimeout(() => { if (active) void restore(value); }, 0);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) { setAuthError(error.message); setLoading(false); }
      else void restore(data.session);
    }).catch(error => { if (active) { setAuthError(error.message); setLoading(false); } });
    return () => { active = false; mounted.current = false; authGeneration.current += 1; subscription.unsubscribe(); };
  }, [rememberPatient]);

  const commit = useCallback((next) => {
    current.current = next;
    setSession(next);
    if (!rememberPatient) return;
    writes.current = writes.current.catch(() => {}).then(async () => {
      let saved = false;
      try { saved = await savePatientSession(next); } catch { /* Continue in memory. */ }
      if (mounted.current) setStorageWarning(saved ? '' : 'Your setup or changes could not be saved on this device. You can continue, but they may be lost after restarting.');
    });
  }, [rememberPatient]);

  const refreshProfile = useCallback(async () => {
    const previous = current.current;
    if (!previous || refreshPending.current) return;
    refreshPending.current = true;
    setProfileRefreshing(true);
    try {
      const shared = await fetchSharedPatientProfile(previous.profile);
      if (!mounted.current || current.current?.profile.id !== previous.profile.id) return;
      // Merge into the latest session so refresh cannot undo local settings or photos.
      if (Object.keys(shared).some(key => current.current.profile[key] !== shared[key])) {
        commit({ ...current.current, profile: { ...current.current.profile, ...shared } });
      }
      setProfileWarning('');
    } catch {
      if (mounted.current) setProfileWarning('Patient details could not be refreshed. Your last loaded details are still shown.');
    } finally {
      refreshPending.current = false;
      if (mounted.current) setProfileRefreshing(false);
    }
  }, [commit]);

  useEffect(() => { if (session?.profile.id) void refreshProfile(); }, [session?.profile.id, refreshProfile]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        supabase?.auth.startAutoRefresh();
        void refreshProfile();
      } else supabase?.auth.stopAutoRefresh();
    });
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshProfile(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisible);
    return () => {
      subscription.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshProfile]);

  async function signIn(email, password) {
    if (!isSupabaseConfigured) throw new Error('Patient sign-in is unavailable. Configure Supabase and restart the app.');
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    authGeneration.current += 1;
    current.current = null;
    setSession(null);
    setProfileWarning('');
    setStorageWarning('');
  }

  function updateProfile(patch) {
    const previous = current.current;
    if (!previous) throw new Error('Complete patient setup first.');
    const profile = {
      ...previous.profile,
      preferredName: (patch.preferredName ?? previous.profile.preferredName).trim(),
      photoUri: patch.photoUri === undefined ? previous.profile.photoUri : patch.photoUri,
    };
    const errors = validateProfile({ ...profile, pinEnabled: false });
    if (errors.email) throw new Error(errors.email);
    commit({ ...previous, profile });
  }

  function updatePreferences(patch) {
    const previous = current.current;
    if (!previous) throw new Error('Complete patient setup first.');
    if (patch.appearance !== undefined && !['light', 'dark', 'system'].includes(patch.appearance)) throw new Error('Choose a valid appearance.');
    const preferences = { ...previous.preferences, ...patch };
    if (!validReminder(preferences.reminders)) throw new Error('Choose at least one day and a valid time (HH:MM).');
    commit({ ...previous, preferences });
  }

  function changePin({ currentPin = '', newPin }) {
    const previous = current.current;
    if (!previous) throw new Error('Complete patient setup first.');
    if (previous.pin && currentPin !== previous.pin) throw new Error('Your current PIN does not match.');
    if (newPin !== null && !/^\d{4}$/.test(newPin ?? '')) throw new Error('Choose a 4-digit PIN.');
    commit({ ...previous, pin: newPin });
  }

  return <PatientSessionContext.Provider value={{ session, loading, storageWarning, profileWarning, profileRefreshing, refreshProfile, preferences: session?.preferences || defaultPreferences(), authError, signIn, signOut, updateProfile, updatePreferences, changePin }}><AppThemeProvider preference={session?.preferences.appearance || 'system'}>{children}</AppThemeProvider></PatientSessionContext.Provider>;
}

export function usePatientSession() {
  const context = useContext(PatientSessionContext);
  if (!context) throw new Error('PatientSessionProvider is missing.');
  return context;
}
