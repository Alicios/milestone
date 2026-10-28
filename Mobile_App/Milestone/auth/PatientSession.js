import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { fetchMyPatientProfile, clearMyPendingOtp } from '../lib/patientApi';
import { loadLocalExtras, saveLocalExtras, clearLocalExtras } from './localPatientExtras';
import { defaultPreferences, normalizePreferences, validReminder } from './preferences';
import { AppThemeProvider } from '../components/AppTheme';

export const PatientSessionContext = createContext(null);

export function PatientSessionProvider({ children }) {
  // authUser: undefined = not yet known, null = signed out, object = signed in.
  const [authUser, setAuthUser] = useState(undefined);
  const [patientRow, setPatientRow] = useState(null);
  const [localExtras, setLocalExtras] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [profileWarning, setProfileWarning] = useState('');
  const [profileRefreshing, setProfileRefreshing] = useState(false);
  const refreshPending = useRef(false);
  const current = useRef(null);
  const writes = useRef(Promise.resolve());
  const mounted = useRef(true);
  const authUserRef = useRef(null);

  useEffect(() => {
    mounted.current = true;
    if (!isSupabaseConfigured) {
      setAuthUser(null);
      setLoading(false);
      return () => { mounted.current = false; };
    }

    let active = true;

    async function handle(nextSession) {
      if (!active) return;
      const user = nextSession?.user ?? null;
      authUserRef.current = user;
      setAuthUser(user);
      if (!user) {
        setPatientRow(null);
        setLocalExtras(null);
        current.current = null;
        setProfileError('');
        setProfileWarning('');
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [profileRow, extras] = await Promise.all([
          fetchMyPatientProfile(),
          loadLocalExtras(user.id),
        ]);
        if (!active) return;
        if (!profileRow) {
          // Signed in, but no patient record matches this account anymore —
          // e.g. a provider deleted the patient while this device stayed
          // signed in. Force back to sign-in instead of leaving a PIN lock
          // screen for an account that no longer exists and can never be
          // unlocked. Don't setLoading(false) here: signOut() triggers
          // onAuthStateChange -> handle(null), which finishes resetting
          // state and clears loading itself, avoiding a one-frame flash of
          // stale content first.
          await clearLocalExtras(user.id);
          await supabase.auth.signOut();
          return;
        }
        setPatientRow(profileRow);
        setLocalExtras(extras);
        current.current = extras;
        setProfileError('');
        setLoading(false);
      } catch (failure) {
        if (active) {
          setProfileError(failure.message || 'Unable to load your profile.');
          setLoading(false);
        }
      }
    }

    supabase.auth.getSession().then(({ data }) => handle(data.session));
    // Defer out of the callback to avoid deadlocking supabase-js, same pattern
    // as Web_App's AuthContext.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => { handle(nextSession); }, 0);
    });
    return () => { active = false; mounted.current = false; listener.subscription.unsubscribe(); };
  }, []);

  function commitExtras(next) {
    current.current = next;
    setLocalExtras(next);
    const user = authUserRef.current;
    if (!user) return;
    writes.current = writes.current.catch(() => {}).then(async () => {
      let saved = false;
      try { saved = await saveLocalExtras(user.id, next); } catch { /* Continue in memory. */ }
      if (mounted.current) setStorageWarning(saved ? '' : 'Your changes could not be saved on this device. You can continue, but they may be lost after restarting.');
    });
  }

  // Re-fetches just the server-side profile (not local extras) so the
  // patient's name/care status/etc. stay current if a provider updates them
  // while the app stays open, without disturbing locally-saved PIN/photo/prefs.
  const refreshProfile = useCallback(async () => {
    if (!authUserRef.current || refreshPending.current) return;
    refreshPending.current = true;
    setProfileRefreshing(true);
    try {
      const profileRow = await fetchMyPatientProfile();
      if (!mounted.current) return;
      if (!profileRow) {
        // Same "patient record disappeared mid-session" case as the initial
        // load (see handle() above) — force back to sign-in.
        const user = authUserRef.current;
        if (user) await clearLocalExtras(user.id);
        await supabase.auth.signOut();
        return;
      }
      setPatientRow(profileRow);
      setProfileWarning('');
    } catch {
      if (mounted.current) setProfileWarning('Patient details could not be refreshed. Your last loaded details are still shown.');
    } finally {
      refreshPending.current = false;
      if (mounted.current) setProfileRefreshing(false);
    }
  }, []);

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

  async function verifyCode(email, token) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
    const trimmedEmail = email.trim();
    const trimmedToken = token.trim();
    // api/invite-patient.ts always requests admin.generateLink({ type:
    // 'magiclink' }), but Supabase appears to file a *brand-new* user's very
    // first code under a different internal bucket than a returning user's
    // (observed: a patient's first-ever code fails verifyOtp with type:
    // 'magiclink', but a regenerated code for that same now-existing user
    // works). Rather than guess which bucket a given code landed in, try the
    // plausible types in order and only surface the last error if all fail.
    let lastError = null;
    for (const type of ['magiclink', 'email', 'signup']) {
      const { error } = await supabase.auth.verifyOtp({ email: trimmedEmail, token: trimmedToken, type });
      if (!error) {
        // onAuthStateChange picks up the new session and loads the real
        // profile. The code was generated by the provider's web app
        // (admin.generateLink) and shown there until used; clear it now so
        // it can't be read back.
        try { await clearMyPendingOtp(); } catch { /* best-effort; it also just expires. */ }
        return;
      }
      lastError = error;
    }
    throw lastError;
  }

  async function signOut() {
    await supabase.auth.signOut();
    // onAuthStateChange resets authUser/patientRow/localExtras to null.
  }

  function completeLocalProfile(next) {
    commitExtras({ ...next, preferences: normalizePreferences(next.preferences) });
  }

  function updateProfile(patch) {
    const previous = current.current;
    if (!previous) throw new Error('Complete your profile first.');
    commitExtras({
      ...previous,
      preferredName: (patch.preferredName ?? previous.preferredName).trim(),
      photoUri: patch.photoUri === undefined ? previous.photoUri : patch.photoUri,
    });
  }

  function updatePreferences(patch) {
    const previous = current.current;
    if (!previous) throw new Error('Complete your profile first.');
    if (patch.appearance !== undefined && !['light', 'dark', 'system'].includes(patch.appearance)) throw new Error('Choose a valid appearance.');
    const preferences = { ...previous.preferences, ...patch };
    if (!validReminder(preferences.reminders)) throw new Error('Choose at least one day and a valid time (HH:MM).');
    commitExtras({ ...previous, preferences });
  }

  function changePin({ currentPin = '', newPin }) {
    const previous = current.current;
    if (!previous) throw new Error('Complete your profile first.');
    if (previous.pin && currentPin !== previous.pin) throw new Error('Your current PIN does not match.');
    if (newPin !== null && !/^\d{4}$/.test(newPin ?? '')) throw new Error('Choose a 4-digit PIN.');
    commitExtras({ ...previous, pin: newPin });
  }

  const profile = patientRow ? {
    id: patientRow.id,
    fullName: patientRow.name,
    email: patientRow.email,
    phone: patientRow.phone || '',
    primaryConcern: patientRow.primary_concern,
    treatmentFocus: patientRow.treatment_focus,
    startOfCare: patientRow.start_of_care,
    careStatus: patientRow.care_status,
    preferredName: localExtras?.preferredName || '',
    dateOfBirth: localExtras?.dateOfBirth || '',
    photoUri: localExtras?.photoUri || null,
  } : null;

  const session = profile ? { profile, pin: localExtras?.pin ?? null, preferences: localExtras?.preferences || defaultPreferences() } : null;
  const needsLocalSetup = Boolean(authUser && patientRow && !localExtras);

  const value = {
    authUser,
    loading,
    profileError,
    storageWarning,
    profileWarning,
    profileRefreshing,
    refreshProfile,
    needsLocalSetup,
    session,
    preferences: session?.preferences || defaultPreferences(),
    verifyCode,
    signOut,
    completeLocalProfile,
    updateProfile,
    updatePreferences,
    changePin,
  };

  return (
    <PatientSessionContext.Provider value={value}>
      <AppThemeProvider preference={session?.preferences.appearance || 'system'}>{children}</AppThemeProvider>
    </PatientSessionContext.Provider>
  );
}

export function usePatientSession() {
  const context = useContext(PatientSessionContext);
  if (!context) throw new Error('PatientSessionProvider is missing.');
  return context;
}
