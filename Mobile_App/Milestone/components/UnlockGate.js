import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getBiometricSupport,
  initializeDefaultUnlock,
  readUnlockRecord,
  setUpUnlock,
  unlockWithBiometrics,
  unlockWithSecret,
} from '../auth/deviceUnlock';
import UnlockScreen from './UnlockScreen';
import Text from './AppText';

export default function UnlockGate({ children }) {
  const [record, setRecord] = useState(null);
  const [checking, setChecking] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [support, setSupport] = useState({ available: false, label: 'Face or fingerprint', reason: 'Checking biometric availability…' });
  const [unlocked, setUnlocked] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lockVersion, setLockVersion] = useState(0);
  const operation = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setChecking(true);
    setLoadError('');
    try {
      const [saved, biometrics] = await Promise.all([initializeDefaultUnlock(), getBiometricSupport()]);
      if (!mounted.current) return;
      setRecord(saved);
      setSupport(biometrics);
    } catch {
      if (mounted.current) setLoadError('We couldn’t read your unlock settings. Check that storage is available, then try again.');
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, []);

  const lock = useCallback(() => {
    operation.current += 1;
    setUnlocked(false);
    setLockVersion(value => value + 1);
    setError('');
  }, []);

  const clearError = useCallback(() => setError(''), []);

  useEffect(() => {
    mounted.current = true;
    refresh();
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
  }, [refresh, lock]);

  async function submit(method, values) {
    if (pending.current) return;
    pending.current = true;
    const currentOperation = ++operation.current;
    setBusy(true);
    setError('');
    try {
      const saved = method === 'setup'
        ? await setUpUnlock(values)
        : method === 'biometric'
          ? await unlockWithBiometrics()
          : await unlockWithSecret(method, values.secret, values.enableBiometrics);
      if (!mounted.current) return;
      setRecord(saved);
      if (operation.current === currentOperation) {
        setHasOpened(true);
        setUnlocked(true);
      }
    } catch (failure) {
      if (!mounted.current) return;
      if (operation.current === currentOperation) {
        setError(failure.message || 'Unable to unlock Milestone. Please try again.');
      }
      try {
        const saved = await readUnlockRecord();
        if (mounted.current) setRecord(saved);
      } catch {
        if (mounted.current) setLoadError('We couldn’t read your unlock settings. Please try again.');
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (checking || loadError) {
    return (
      <SafeAreaView style={styles.loading}>
        {loadError ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry loading unlock settings" onPress={refresh} style={styles.retry}>
              <Text>Try again</Text>
            </Pressable>
          </>
        ) : <ActivityIndicator color="#357F83" accessibilityLabel="Loading unlock settings" />}
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.content}>
      {hasOpened && (
        <View style={unlocked ? styles.content : styles.hidden} importantForAccessibility={unlocked ? 'auto' : 'no-hide-descendants'}>
          {children({ unlocked, onLock: lock })}
        </View>
      )}
      {!unlocked && (
        <UnlockScreen
          key={lockVersion}
          record={record}
          support={support}
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: '6%', backgroundColor: '#F4EACF' },
  error: { color: '#B84613', textAlign: 'center' },
  retry: { padding: 16, marginTop: 16, backgroundColor: '#9BCBC5', borderRadius: 14 },
});
