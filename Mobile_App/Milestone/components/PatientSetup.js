import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Text from './AppText';
import Brand from './Brand';
import { useAppTheme, useThemedStyles } from './AppTheme';

export default function PatientSetup({ onSignIn, authError = '' }) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useAppTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    if (busy) return;
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true);
    setError('');
    try { await onSignIn(email, password); }
    catch (failure) { setError(failure.message || 'Unable to sign in. Please try again.'); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={styles.safeArea}>
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}><Brand /></View>
        <Text accessibilityRole="header" style={styles.title}>Welcome to Milestone.</Text>
        <Text style={styles.subtitle}>Sign in with your patient account. Use your provider's invitation email to set your password first.</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Email address</Text>
          <TextInput accessibilityLabel="Email address" style={styles.input} placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" autoCapitalize="none" autoCorrect={false} editable={!busy} />
          <Text style={[styles.label, { marginTop: 18 }]}>Password</Text>
          <TextInput accessibilityLabel="Password" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" editable={!busy} onSubmitEditing={submit} returnKeyType="go" />
          {error || authError ? <Text accessibilityRole="alert" style={styles.error}>{error || authError}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Sign in" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={submit} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Signing in...' : 'Sign in'}</Text></Pressable>
        </View>
        <Text style={styles.subtitle}>Need an account or a new invitation? Contact your provider.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
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
  cardTitle: { color: '#193333', fontSize: 21, fontWeight: '700' },
  photoSection: { alignItems: 'center', marginTop: 24 },
  photoButton: { minHeight: 44, paddingHorizontal: 16, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: '#B7CAC2', justifyContent: 'center', alignItems: 'center' },
  removePhoto: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  removeText: { color: '#A83E14', fontSize: 12, fontWeight: '600' },
  field: { marginTop: 18 },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  phoneInput: { flex: 1, width: undefined, minWidth: 0, paddingHorizontal: 10, fontSize: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#193333', marginBottom: 8 },
  input: { width: '100%', minHeight: 54, borderRadius: 13, borderWidth: 1.5, borderColor: '#B7CAC2', backgroundColor: '#FFFDF7', paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: '#193333' },
  readOnly: { backgroundColor: '#EDF2E9' },
  invalid: { borderColor: '#A83E14' },
  error: { color: '#A83E14', fontSize: 13, lineHeight: 20, marginTop: 8 },
  pinOption: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 },
  pinLabel: { flex: 1, color: '#193333', fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 12, color: '#357F83', lineHeight: 19, marginTop: 8 },
  primary: { backgroundColor: '#193333', borderRadius: 14, minHeight: 56, padding: 14, marginTop: 24, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFDF7', fontSize: 16, fontWeight: '700' },
  back: { minHeight: 48, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#357F83', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.5 },
  footer: { color: '#357F83', fontSize: 12, textAlign: 'center', marginTop: 28 },
});
