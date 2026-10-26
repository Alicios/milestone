import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from './AppTheme';
import Text from './AppText';
import Brand from './Brand';
import { signInPatientAccount } from '../auth/patientAccount';

export default function PatientAccountSignIn({ onCancel, onComplete }) {
  const { colors, barStyle } = useAppTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onComplete(await signInPatientAccount(email, password));
    } catch (failure) {
      setError(failure?.message || 'Unable to sign in. Check your details and try again.');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={barStyle} backgroundColor={colors.background} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}><Brand /></View>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Sign in to Milestone</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Use the email and password you set from your provider's invitation.</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.text }]}>Email address</Text>
            <TextInput accessibilityLabel="Email address" value={email} onChangeText={value => { setEmail(value); setError(''); }} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" editable={!busy} placeholder="you@example.com" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
            <Text style={[styles.label, { color: colors.text }]}>Password</Text>
            <TextInput accessibilityLabel="Password" value={password} onChangeText={value => { setPassword(value); setError(''); }} secureTextEntry autoCapitalize="none" autoComplete="password" textContentType="password" editable={!busy} onSubmitEditing={submit} returnKeyType="done" placeholder="Password" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Sign in" accessibilityState={{ disabled: busy || !email.trim() || !password, busy }} disabled={busy || !email.trim() || !password} onPress={submit} style={[styles.primary, (busy || !email.trim() || !password) && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Signing in…' : 'Sign in'}</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to patient setup" disabled={busy} onPress={onCancel} style={styles.back}><Text style={[styles.backText, { color: colors.primary }]}>Back</Text></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  safeArea: { flex: 1 },
  page: { width: '90%', maxWidth: 440, alignSelf: 'center', flexGrow: 1, justifyContent: 'center', paddingVertical: 32 },
  brand: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 10, marginBottom: 26 },
  card: { borderRadius: 24, borderWidth: 1, paddingHorizontal: '7%', paddingVertical: 26 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 18 },
  input: { width: '100%', minHeight: 54, borderRadius: 13, borderWidth: 1.5, backgroundColor: 'transparent', paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  error: { color: '#A83E14', fontSize: 13, lineHeight: 20, marginTop: 12 },
  primary: { backgroundColor: '#193333', borderRadius: 14, minHeight: 56, padding: 14, marginTop: 24, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFDF7', fontSize: 16, fontWeight: '700' },
  back: { minHeight: 48, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.5 },
});
