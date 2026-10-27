import { useAppTheme, useThemedStyles } from './AppTheme';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Text from './AppText';
import Brand from './Brand';
import { usePatientSession } from '../auth/PatientSession';

function Field({ label, ...props }) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

export default function SignInScreen() {
  const { verifyCode } = usePatientSession();
  const styles = useThemedStyles(baseStyles);
  const { colors, barStyle } = useAppTheme();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function verify() {
    if (busy) return;
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!/^\d{6,10}$/.test(code)) {
      setError('Enter the login code your provider gave you.');
      return;
    }
    setBusy(true);
    try {
      await verifyCode(email.trim(), code);
      // A successful verify establishes a session; PatientSessionProvider's
      // onAuthStateChange listener picks it up from here.
    } catch (failure) {
      setError(failure.message || "That code didn't work. Check it, or ask your provider for a new one.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={barStyle} backgroundColor={colors.background} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.fill} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}><Brand /></View>
          <Text style={styles.eyebrow}>YOUR NEXT MILESTONE STARTS HERE</Text>
          <Text accessibilityRole="header" style={styles.title}>Welcome.</Text>
          <Text style={styles.subtitle}>Enter the email your provider has on file and the code they gave you.</Text>
          <View style={styles.card}>
            <Field
              label="Email address"
              accessibilityLabel="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              placeholder="you@example.com"
              returnKeyType="next"
              editable={!busy}
            />
            <Field
              label="Login code"
              accessibilityLabel="Login code"
              value={code}
              onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 10))}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={10}
              autoComplete="one-time-code"
              onSubmitEditing={verify}
              returnKeyType="go"
              editable={!busy}
            />
            {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Sign in" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={verify} style={[styles.primary, busy && styles.disabled]}>
              {busy ? <ActivityIndicator color={colors.onAccent} accessibilityLabel="Signing in" /> : <Text style={styles.primaryText}>Sign in</Text>}
            </Pressable>
            <Text style={styles.hint}>Don't have a code? Ask your provider to generate one for you.</Text>
          </View>
          <Text style={styles.footer}>Move well. Feel better.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  fill: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#F4EACF' },
  page: { width: '90%', maxWidth: 440, alignSelf: 'center', flexGrow: 1, justifyContent: 'center', paddingVertical: 32 },
  brand: { alignItems: 'center', marginBottom: 32 },
  eyebrow: { color: '#357F83', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textAlign: 'center', marginBottom: 10 },
  title: { color: '#193333', fontSize: 32, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#357F83', fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 10, marginBottom: 26 },
  card: { backgroundColor: '#FFFDF7', borderRadius: 24, borderWidth: 1, borderColor: '#D8DFD0', paddingHorizontal: '7%', paddingVertical: 26 },
  field: { marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#193333', marginBottom: 8 },
  input: { width: '100%', minHeight: 54, borderRadius: 13, borderWidth: 1.5, borderColor: '#B7CAC2', backgroundColor: '#FFFDF7', paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: '#193333' },
  error: { color: '#A83E14', fontSize: 13, lineHeight: 20, marginTop: 14 },
  hint: { color: '#357F83', fontSize: 13, lineHeight: 20, marginTop: 14 },
  primary: { backgroundColor: '#193333', borderRadius: 14, minHeight: 56, padding: 14, marginTop: 22, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFDF7', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.5 },
  back: { minHeight: 44, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#357F83', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  footer: { color: '#357F83', fontSize: 12, textAlign: 'center', marginTop: 32 },
});
