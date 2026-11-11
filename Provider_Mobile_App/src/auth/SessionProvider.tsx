import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import type { Session } from '@supabase/supabase-js';
import { api } from '../lib/client';
import { friendlyError } from '../lib/domain';
import { isConfigured, sessionStorage, storageKey, supabase } from '../lib/supabase';
import type { Provider } from '../types';
import { verifyProviderSession } from './verification';
import { deviceUnlockOutcome, endDeviceSession, logoutMarker } from './deviceSecurity';

type Phase = 'restoring' | 'signedOut' | 'mfa' | 'locked' | 'ready';
type Auth = { phase: Phase; provider: Provider | null; busy: boolean; error: string; covered: boolean;
  login(email: string, password: string): Promise<void>; verifyMfa(code: string): Promise<void>;
  unlock(): Promise<void>; lock(): void; logout(): Promise<void> };
const Context = createContext<Auth | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('restoring');
  const [provider, setProvider] = useState<Provider | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [covered, setCovered] = useState(AppState.currentState !== 'active');
  const live = useRef(true);
  const version = useRef(0);
  const operation = useRef(false);
  const prompting = useRef(false);
  const verified = useRef<Session | null>(null);
  const factorId = useRef<string | null>(null);
  const phaseRef = useRef<Phase>('restoring');
  const blocked = useRef(false);
  const transition = (next: Phase) => { phaseRef.current = next; setPhase(next); };
  const current = (generation: number) => live.current && generation === version.current && !blocked.current;
  const clear = () => { verified.current = null; factorId.current = null; setProvider(null); };

  async function resolve(session: Session, generation: number, interactive = false, mfa = false) {
    const result = await verifyProviderSession(supabase, session, api.provider, mfa);
    if (!current(generation)) return;
    const active = await supabase.auth.getSession();
    if (!current(generation)) return;
    if (active.error || active.data.session?.access_token !== session.access_token) throw new Error('Authentication changed. Please sign in again.');
    verified.current = session;
    if (result.kind === 'mfa') {
      setProvider(null); factorId.current = result.factorId; transition('mfa');
    } else {
      if (interactive) await sessionStorage.removeItem(logoutMarker);
      if (!current(generation)) return;
      factorId.current = null; setProvider(result.provider);
      // Password + MFA is an unlock. Restored sessions always require device unlock.
      transition(interactive && AppState.currentState === 'active' ? 'ready' : phaseRef.current === 'ready' ? 'ready' : 'locked');
    }
  }
  function fail(cause: unknown, generation: number) {
    if (live.current && generation === version.current) { clear(); transition('signedOut'); setError(friendlyError(cause)); }
  }

  const logout = useCallback(async () => {
    ++version.current; blocked.current = true; clear(); transition('signedOut'); setError(''); setBusy(true);
    try {
      // A durable marker prevents a partially failed sign-out restoring care access.
      await endDeviceSession(sessionStorage, storageKey, () => supabase.auth.signOut({ scope: 'local' }));
    } catch (cause) { if (live.current) setError(friendlyError(cause)); }
    finally { if (live.current) setBusy(false); }
  }, []);

  useEffect(() => {
    live.current = true;
    const generation = ++version.current;
    if (!isConfigured) { transition('signedOut'); return; }
    const restore = async () => {
      if (await sessionStorage.getItem(logoutMarker)) { blocked.current = true; transition('signedOut'); return; }
      const result = await supabase.auth.getSession();
      if (result.error) throw result.error;
      if (!current(generation)) return;
      if (result.data.session) await resolve(result.data.session, generation);
      else transition('signedOut');
    };
    void restore().catch(cause => fail(cause, generation));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT') {
        ++version.current; clear(); transition('signedOut'); return;
      }
      if (operation.current || blocked.current || !session) return;
      // SDK callbacks must return before making further SDK requests.
      const request = ++version.current;
      if (verified.current?.user.id !== session.user.id || event !== 'TOKEN_REFRESHED') {
        clear(); transition('restoring');
      }
      setTimeout(() => { if (current(request)) void resolve(session, request).catch(cause => fail(cause, request)); }, 0);
    });
    const onState = (next: string) => {
      if (!live.current) return;
      if (prompting.current && next === 'inactive') return;
      if (next !== 'active') {
        setCovered(true); supabase.auth.stopAutoRefresh();
        if (next === 'background' && prompting.current) { ++version.current; prompting.current = false; }
        if (phaseRef.current === 'ready') transition('locked');
      } else {
        setCovered(false); supabase.auth.startAutoRefresh();
        if (verified.current?.expires_at && verified.current.expires_at * 1000 <= Date.now() && phaseRef.current === 'ready') transition('locked');
      }
    };
    const listener = AppState.addEventListener('change', onState);
    const timer = setInterval(() => {
      if (verified.current?.expires_at && verified.current.expires_at * 1000 <= Date.now() && phaseRef.current === 'ready') transition('locked');
    }, 1000);
    if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
    return () => { live.current = false; ++version.current; data.subscription.unsubscribe(); listener.remove(); clearInterval(timer); supabase.auth.stopAutoRefresh(); };
  }, []);

  async function authenticate(task: (generation: number) => Promise<void>) {
    if (operation.current) return;
    operation.current = true; blocked.current = false;
    const generation = ++version.current;
    setBusy(true); setError('');
    try { await task(generation); }
    catch (cause) { if (current(generation)) setError(friendlyError(cause)); }
    finally { operation.current = false; if (live.current) setBusy(false); }
  }
  async function login(email: string, password: string) {
    await authenticate(async generation => {
      if (!email.trim() || !password) throw new Error('Please enter your email and password.');
      clear(); transition('signedOut');
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (!current(generation)) return;
      if (signInError) throw signInError;
      if (!data.session) throw new Error('Authentication did not return a session.');
      try { await resolve(data.session, generation, true); }
      catch (cause) { clear(); transition('signedOut'); throw cause; }
    });
  }
  async function verifyMfa(code: string) {
    await authenticate(async generation => {
      if (!/^\d{6}$/.test(code)) throw new Error('Please enter the six-digit code from your authenticator.');
      const expected = verified.current;
      if (!factorId.current || !expected) throw new Error('Authentication changed. Please sign in again.');
      const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factorId.current, code });
      if (mfaError) throw mfaError;
      const result = await supabase.auth.getSession();
      if (!current(generation)) return;
      if (result.error || !result.data.session || result.data.session.user.id !== expected.user.id) throw new Error('Authentication changed. Please sign in again.');
      await resolve(result.data.session, generation, true, true);
    });
  }
  async function unlock() {
    await authenticate(async generation => {
      if (Platform.OS === 'web' || (await LocalAuthentication.getEnrolledLevelAsync()) === LocalAuthentication.SecurityLevel.NONE) { await logout(); return; }
      prompting.current = true;
      try {
        const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Milestone Provider', cancelLabel: 'Cancel', fallbackLabel: 'Use device passcode', disableDeviceFallback: false });
        if (!current(generation)) return;
        const outcome = deviceUnlockOutcome(result);
        if (outcome === 'signIn') { await logout(); return; }
        if (outcome !== 'unlocked') return;
        const session = await supabase.auth.getSession();
        if (session.error || !session.data.session || session.data.session.user.id !== verified.current?.user.id) throw new Error('Your session could not be verified. Please sign in again.');
        await resolve(session.data.session, generation);
        if (current(generation) && phaseRef.current === 'locked') transition('ready');
      } finally { prompting.current = false; }
    });
  }
  function lock() { setError(''); if (phaseRef.current === 'ready') transition('locked'); }

  return <Context.Provider value={{ phase, provider, busy, error, covered, login, verifyMfa, unlock, lock, logout }}>{children}</Context.Provider>;
}
export function useSession() {
  const context = useContext(Context);
  if (!context) throw new Error('SessionProvider is missing');
  return context;
}
