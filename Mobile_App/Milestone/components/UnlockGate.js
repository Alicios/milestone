import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, StyleSheet, View } from 'react-native';
import { unlockWithSecret } from '../auth/deviceUnlock';
import UnlockScreen from './UnlockScreen';
import PatientSetup from './PatientSetup';
import Text from './AppText';
import { REMEMBER_MOCK_PATIENT } from '../auth/mockPatient';
import { loadMockSession, saveMockSession } from '../auth/mockPatientStorage';

export default function UnlockGate({ children, rememberPatient = REMEMBER_MOCK_PATIENT }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(rememberPatient);
  const [storageWarning, setStorageWarning] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lockVersion, setLockVersion] = useState(0);
  const operation = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(true);
  const pinEnabled = Boolean(session?.pin);

  useEffect(() => {
    if (!rememberPatient) return undefined;
    let active = true;
    loadMockSession().then(saved => {
      if (!active) return;
      setSession(saved);
      if (saved && !saved.pin) {
        setHasOpened(true);
        setUnlocked(true);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [rememberPatient]);

  const lock = useCallback(() => {
    if (!pinEnabled) return;
    operation.current += 1;
    setUnlocked(false);
    setLockVersion(value => value + 1);
    setError('');
  }, [pinEnabled]);

  const clearError = useCallback(() => setError(''), []);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') lock();
    });
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') lock();
    };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted.current = false;
      operation.current += 1;
      subscription.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [lock]);

  async function submit(secret) {
    if (pending.current) return;
    pending.current = true;
    const currentOperation = ++operation.current;
    setBusy(true);
    setError('');
    try {
      await unlockWithSecret('pin', secret, session?.pin);
      if (!mounted.current) return;
      if (operation.current === currentOperation) {
        setHasOpened(true);
        setUnlocked(true);
      }
    } catch (failure) {
      if (!mounted.current) return;
      if (operation.current === currentOperation) {
        setError(failure.message || 'Unable to unlock Milestone. Please try again.');
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function completeSetup(nextSession) {
    const saved = rememberPatient ? await saveMockSession(nextSession) : true;
    if (!mounted.current) return;
    if (!saved) setStorageWarning('Your setup could not be saved on this device. You can continue, but setup will repeat after restarting.');
    setSession(nextSession);
    setHasOpened(true);
    setUnlocked(true);
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#357F83" accessibilityLabel="Loading patient setup" /></View>;
  if (!session) return <PatientSetup onComplete={completeSetup} />;

  return (
    <View style={styles.content}>
      {storageWarning && unlocked ? <Text accessibilityRole="alert" style={styles.warning}>{storageWarning}</Text> : null}
      {hasOpened && (
        <View style={unlocked ? styles.content : styles.hidden} importantForAccessibility={unlocked ? 'auto' : 'no-hide-descendants'}>
          {children({ unlocked, onLock: pinEnabled ? lock : undefined, profile: session.profile })}
        </View>
      )}
      {!unlocked && (
        <UnlockScreen
          key={lockVersion}
          busy={busy}
          error={error}
          onSubmit={submit}
          onClearError={clearError}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  hidden: { display: 'none' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4EACF' },
  warning: { backgroundColor: '#F4EACF', color: '#A83E14', padding: 16, fontSize: 13 },
});
