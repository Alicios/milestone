import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { fetchSharedPatientProfile } from '../lib/patientProfile';
import { MOCK_PATIENT, REMEMBER_MOCK_PATIENT, validateProfile } from './mockPatient';
import { loadMockSession, saveMockSession } from './mockPatientStorage';
import { defaultPreferences, normalizePreferences, validReminder } from './preferences';
import { AppThemeProvider } from '../components/AppTheme';

export const PatientSessionContext = createContext(null);

export function PatientSessionProvider({ children, rememberPatient = REMEMBER_MOCK_PATIENT }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(rememberPatient);
  const [storageWarning, setStorageWarning] = useState('');
  const [profileWarning, setProfileWarning] = useState('');
  const [profileRefreshing, setProfileRefreshing] = useState(false);
  const refreshPending = useRef(false);
  const current = useRef(null);
  const writes = useRef(Promise.resolve());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (rememberPatient) {
      loadMockSession().catch(() => null).then(saved => {
        if (!active) return;
        const restored = saved ? { ...saved, profile: { ...saved.profile, databasePatientId: saved.profile.databasePatientId || MOCK_PATIENT.databasePatientId }, preferences: normalizePreferences(saved.preferences) } : null;
        current.current = restored;
        setSession(restored);
        setLoading(false);
      });
    }
    return () => { active = false; mounted.current = false; };
  }, [rememberPatient]);

  const commit = useCallback((next) => {
    current.current = next;
    setSession(next);
    if (!rememberPatient) return;
    writes.current = writes.current.catch(() => {}).then(async () => {
      let saved = false;
      try { saved = await saveMockSession(next); } catch { /* Continue in memory. */ }
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
      if (state === 'active') void refreshProfile();
    });
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshProfile(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisible);
    return () => {
      subscription.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshProfile]);

  function completeSetup(next) {
    commit({ ...next, preferences: normalizePreferences(next.preferences) });
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

  return <PatientSessionContext.Provider value={{ session, loading, storageWarning, profileWarning, profileRefreshing, refreshProfile, preferences: session?.preferences || defaultPreferences(), completeSetup, updateProfile, updatePreferences, changePin }}><AppThemeProvider preference={session?.preferences.appearance || 'system'}>{children}</AppThemeProvider></PatientSessionContext.Provider>;
}

export function usePatientSession() {
  const context = useContext(PatientSessionContext);
  if (!context) throw new Error('PatientSessionProvider is missing.');
  return context;
}
