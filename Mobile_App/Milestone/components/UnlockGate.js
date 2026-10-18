import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { unlockWithSecret } from '../auth/deviceUnlock';
import UnlockScreen from './UnlockScreen';

export default function UnlockGate({ children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lockVersion, setLockVersion] = useState(0);
  const operation = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(true);

  const lock = useCallback(() => {
    operation.current += 1;
    setUnlocked(false);
    setLockVersion(value => value + 1);
    setError('');
  }, []);

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
      await unlockWithSecret('pin', secret);
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
});
