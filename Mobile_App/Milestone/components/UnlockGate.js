import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, findNodeHandle, Platform, Pressable, StyleSheet, View } from 'react-native';
import { unlockWithSecret } from '../auth/deviceUnlock';
import UnlockScreen from './UnlockScreen';
import PatientSetup from './PatientSetup';
import Text from './AppText';
import { PatientSessionContext, PatientSessionProvider, usePatientSession } from '../auth/PatientSession';
import { useAppTheme, useThemedStyles } from './AppTheme';
import ProfileSettingsPanel from './ProfileSettingsPanel';

export default function UnlockGate({ children, rememberPatient }) {
  const context = useContext(PatientSessionContext);
  return context ? <SessionGate>{children}</SessionGate> : <PatientSessionProvider rememberPatient={rememberPatient}><SessionGate>{children}</SessionGate></PatientSessionProvider>;
}

function SessionGate({ children }) {
  const { session, loading, storageWarning, profileWarning, profileRefreshing, refreshProfile, completeSetup: saveSetup } = usePatientSession();
  const styles = useThemedStyles(baseStyles);
  const { colors } = useAppTheme();
  const [panelOpen, setPanelOpen] = useState(false);
  const avatarButton = useRef(null);
  const [unlocked, setUnlocked] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lockVersion, setLockVersion] = useState(0);
  const operation = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(true);
  const pinEnabled = Boolean(session?.pin);
  const patientId = session?.profile.id;
  const patientPin = session?.pin;

  useEffect(() => {
    operation.current += 1;
    if (patientId && !patientPin) { setHasOpened(true); setUnlocked(true); }
  }, [patientId, patientPin]);

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

  function completeSetup(nextSession) {
    saveSetup(nextSession);
    setHasOpened(true);
    setUnlocked(true);
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator color={colors.primary} accessibilityLabel="Loading patient setup" /></View>;
  if (!session) return <PatientSetup onComplete={completeSetup} />;

  return (
    <View style={styles.content}>
      {storageWarning && unlocked ? <Text accessibilityRole="alert" style={styles.warning}>{storageWarning}</Text> : null}
      {profileWarning && unlocked ? <View><Text accessibilityRole="alert" style={styles.warning}>{profileWarning}</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry patient details" disabled={profileRefreshing} onPress={refreshProfile}><Text style={styles.warning}>{profileRefreshing ? 'Refreshing…' : 'Retry patient details'}</Text></Pressable></View> : null}
      {hasOpened && (
        <View style={unlocked ? styles.content : styles.hidden} importantForAccessibility={unlocked ? 'auto' : 'no-hide-descendants'}>
          {children({ unlocked, onLock: pinEnabled ? lock : undefined, profile: session.profile, onOpenProfile: target => { avatarButton.current = target; setPanelOpen(true); } })}
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
      {panelOpen && <ProfileSettingsPanel visible={unlocked} onClose={() => {
        setPanelOpen(false);
        requestAnimationFrame(() => {
          if (Platform.OS === 'web') avatarButton.current?.focus?.();
          else { const handle = findNodeHandle(avatarButton.current); if (handle) AccessibilityInfo.setAccessibilityFocus(handle); }
        });
      }} />}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  content: { flex: 1 },
  hidden: { display: 'none' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4EACF' },
  warning: { backgroundColor: '#F4EACF', color: '#A83E14', padding: 16, fontSize: 13 },
});
