import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Fingerprint from 'lucide-react-native/icons/fingerprint-pattern';
import ScanFace from 'lucide-react-native/icons/scan-face';
import LockKeyhole from 'lucide-react-native/icons/lock-keyhole';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import Brand from './Brand';
import Text from './AppText';

function SecretField({ label, value, onChangeText, pin = false, show, disabled, onSubmitEditing, inputRef }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label} nativeID={`${label.replaceAll(' ', '-')}-label`}>{label}</Text>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={pin ? '6-digit PIN' : 'Your password'}
        placeholderTextColor="#637D7B"
        secureTextEntry={!show}
        keyboardType={pin ? 'number-pad' : 'default'}
        inputMode={pin ? 'numeric' : 'text'}
        maxLength={pin ? 6 : 128}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        editable={!disabled}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="go"
        style={[styles.input, pin && styles.pinInput]}
      />
    </View>
  );
}

export default function UnlockScreen({ record, support, busy, error, onSubmit, onClearError }) {
  const setup = !record;
  const [method, setMethod] = useState('pin');
  const [secret, setSecret] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [enableBiometrics, setEnableBiometrics] = useState(false);
  const [validation, setValidation] = useState('');
  const [now, setNow] = useState(Date.now());
  const secretInput = useRef(null);
  const remaining = Math.max(0, Math.ceil(((record?.lockedUntil || 0) - now) / 1000));
  const disabled = busy || remaining > 0;
  const BiometricIcon = support.label.includes('Face') ? ScanFace : Fingerprint;
  const VisibilityIcon = show ? EyeOff : Eye;

  useEffect(() => {
    setNow(Date.now());
    if (!record?.lockedUntil || record.lockedUntil <= Date.now()) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= record.lockedUntil) {
        onClearError();
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [record?.lockedUntil, onClearError]);

  function changeMethod(next) {
    setMethod(next);
    setSecret('');
    setShow(false);
    setValidation('');
    onClearError();
  }

  function submit() {
    if (disabled) return;
    setValidation('');
    if (setup) {
      if (password.length < 8 || !password.trim()) return setValidation('Choose a password with at least 8 characters.');
      if (password !== passwordConfirm) return setValidation('Your passwords do not match.');
      if (!/^\d{6}$/.test(pin)) return setValidation('Choose a 6-digit PIN using numbers only.');
      if (pin !== pinConfirm) return setValidation('Your PINs do not match.');
      onSubmit('setup', { pin, password, enableBiometrics });
    } else {
      if (method === 'pin' && !/^\d{6}$/.test(secret)) return setValidation('Enter your 6-digit PIN.');
      if (!secret) return setValidation('Enter your password.');
      onSubmit(method, { secret, enableBiometrics });
      setSecret('');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4EACF" />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.fill} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}><Brand /></View>
          <View style={styles.intro}>
            <View style={styles.lockBadge}><LockKeyhole size={30} color="#125b75" accessible={false} /></View>
            <Text style={styles.eyebrow}>YOUR NEXT MILESTONE STARTS HERE</Text>
            <Text accessibilityRole="header" style={styles.title}>{setup ? 'Make it yours.' : 'Welcome back.'}</Text>
            <Text style={styles.subtitle}>{setup ? 'Set a password and PIN to unlock Milestone on this device.' : 'Unlock Milestone and take your next step.'}</Text>
          </View>

          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.cardTitle}>{setup ? 'Set up your unlock' : 'Unlock your app'}</Text>
            {!setup && (
              <View style={styles.methodRow}>
                {['pin', 'password'].map(item => (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${item === 'pin' ? 'PIN' : 'password'}`}
                    accessibilityState={{ selected: method === item, disabled: busy }}
                    disabled={busy}
                    onPress={() => changeMethod(item)}
                    style={[styles.method, method === item && styles.selectedMethod]}
                  >
                    <Text style={[styles.methodText, method === item && styles.selectedMethodText]}>{item === 'pin' ? 'PIN' : 'Password'}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {setup ? (
              <>
                <Text style={styles.hint}>Use at least 8 characters for your password and 6 numbers for your PIN. Keep both somewhere safe.</Text>
                <SecretField label="Create password" value={password} onChangeText={setPassword} show={show} disabled={busy} />
                <SecretField label="Confirm password" value={passwordConfirm} onChangeText={setPasswordConfirm} show={show} disabled={busy} />
                <SecretField label="Create PIN" value={pin} onChangeText={setPin} pin show={show} disabled={busy} />
                <SecretField label="Confirm PIN" value={pinConfirm} onChangeText={setPinConfirm} pin show={show} disabled={busy} onSubmitEditing={submit} />
              </>
            ) : (
              <SecretField label={method === 'pin' ? 'Your PIN' : 'Your password'} value={secret} onChangeText={setSecret} pin={method === 'pin'} show={show} disabled={disabled} onSubmitEditing={submit} inputRef={secretInput} />
            )}

            <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Hide entered text' : 'Show entered text'} onPress={() => setShow(!show)} style={styles.showButton}>
              <VisibilityIcon size={18} color="#357F83" accessible={false} />
              <Text style={styles.showText}>{show ? 'Hide' : 'Show'} {setup ? 'entered text' : method === 'pin' ? 'PIN' : 'password'}</Text>
            </Pressable>

            {support.available && !record?.biometricsEnabled && (
              <View style={styles.enableRow}>
                <View style={styles.enableCopy}>
                  <Text style={styles.label}>Enable {support.label.toLowerCase()}</Text>
                  <Text style={styles.hint}>Use your phone’s saved face or fingerprint next time.</Text>
                </View>
                <Switch accessibilityLabel="Enable biometric unlock" value={enableBiometrics} onValueChange={setEnableBiometrics} disabled={busy} trackColor={{ false: '#CCDAD6', true: '#357F83' }} thumbColor="#FFFDF7" />
              </View>
            )}

            {(validation || error || remaining > 0) && (
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
                {remaining > 0 ? `Too many attempts. Try again in ${remaining} seconds.` : validation || error}
              </Text>
            )}

            <Pressable accessibilityRole="button" accessibilityLabel={setup ? 'Save PIN and password' : 'Unlock Milestone'} accessibilityState={{ disabled, busy }} disabled={disabled} onPress={submit} style={[styles.primary, disabled && styles.disabled]}>
              {busy ? <ActivityIndicator color="#FFFDF7" accessibilityLabel="Checking unlock" /> : <>
                <Text style={styles.primaryText}>{setup ? 'Save & continue' : 'Unlock Milestone'}</Text>
                <ArrowRight size={20} color="#FFFDF7" accessible={false} />
              </>}
            </Pressable>

            {!setup && <>
              <View style={styles.divider}><View style={styles.rule} /><Text style={styles.or}>or</Text><View style={styles.rule} /></View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Unlock with ${support.label.toLowerCase()}`}
                accessibilityState={{ disabled: disabled || !support.available || !record.biometricsEnabled }}
                disabled={disabled || !support.available || !record.biometricsEnabled}
                onPress={() => onSubmit('biometric')}
                style={[styles.biometric, (!support.available || !record.biometricsEnabled || disabled) && styles.disabled]}
              >
                <BiometricIcon size={25} color="#125b75" accessible={false} />
                <Text style={styles.biometricText}>{support.label}</Text>
              </Pressable>
            </>}
            <Text style={styles.footnote}>
              {!support.available ? support.reason : !record?.biometricsEnabled ? 'Biometrics are optional. Enable them with your PIN or password.' : 'Your phone verifies your face or fingerprint. Milestone does not store biometric data.'}
            </Text>
          </View>
          <Text style={styles.localNote}>Device unlock for this app. Your Milestone account is not connected yet.</Text>
          <Text style={styles.footer}>Move well. Feel better.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#F4EACF' },
  page: { width: '92%', maxWidth: 520, alignSelf: 'center', flexGrow: 1, paddingVertical: 24 },
  brandRow: { marginBottom: 28 },
  intro: { alignItems: 'center', marginBottom: 24 },
  lockBadge: { padding: 18, borderRadius: 24, backgroundColor: '#C8DECF', marginBottom: 20 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: '#357F83', textAlign: 'center', marginBottom: 10 },
  title: { fontSize: 34, fontWeight: '800', color: '#193333', textAlign: 'center' },
  subtitle: { color: '#357F83', fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 8, maxWidth: '94%' },
  card: { backgroundColor: '#FFFDF7', borderRadius: 24, borderWidth: 1, borderColor: '#D8DFD0', paddingHorizontal: '6%', paddingVertical: 24 },
  cardTitle: { color: '#193333', fontSize: 21, fontWeight: '700', marginBottom: 18 },
  methodRow: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 14, backgroundColor: '#EDF0E5', marginBottom: 22 },
  method: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 10, padding: 8 },
  selectedMethod: { backgroundColor: '#193333' },
  methodText: { fontSize: 14, fontWeight: '600', color: '#357F83', textAlign: 'center' },
  selectedMethodText: { color: '#FFFDF7' },
  field: { marginTop: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#193333', marginBottom: 8 },
  input: { width: '100%', minHeight: 54, borderRadius: 13, borderWidth: 1.5, borderColor: '#B7CAC2', backgroundColor: '#FFFDF7', paddingHorizontal: '5%', paddingVertical: 14, fontFamily: 'Montserrat_400Regular', fontSize: 16, color: '#193333' },
  pinInput: { letterSpacing: 6 },
  showButton: { flexDirection: 'row', gap: 8, alignItems: 'center', alignSelf: 'flex-end', minHeight: 44, paddingVertical: 10 },
  showText: { fontSize: 12, color: '#357F83', fontWeight: '600' },
  hint: { color: '#526D69', fontSize: 12, lineHeight: 19 },
  enableRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  enableCopy: { flex: 1, minWidth: 0 },
  error: { color: '#A83E14', fontSize: 13, lineHeight: 20, marginVertical: 12 },
  primary: { backgroundColor: '#193333', borderRadius: 14, minHeight: 54, padding: 14, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  primaryText: { color: '#FFFDF7', fontSize: 15, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  disabled: { opacity: 0.5 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 20 },
  rule: { flex: 1, height: 1, backgroundColor: '#D8DFD0' },
  or: { color: '#637D7B', fontSize: 12 },
  biometric: { borderWidth: 1.5, borderColor: '#9BCBC5', backgroundColor: '#EDF4EC', minHeight: 56, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12 },
  biometricText: { color: '#125b75', fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  footnote: { color: '#526D69', fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: 16 },
  localNote: { color: '#526D69', fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: 18, paddingHorizontal: '4%' },
  footer: { color: '#357F83', fontSize: 12, textAlign: 'center', marginTop: 'auto', paddingTop: 24 },
});
