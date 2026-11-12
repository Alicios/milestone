import React, { useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';
import { Fingerprint, LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { useSession } from './SessionProvider';
import { isConfigured } from '../lib/supabase';
import { Brand, Button, Card, Field, Notice, Text } from '../ui/components';
import { KeyboardScrollView } from '../ui/KeyboardLayout';
import { useTheme } from '../ui/theme';

export function AuthScreen() {
  const auth = useSession();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const webUrl = process.env.EXPO_PUBLIC_PROVIDER_WEB_URL;
  const restoring = auth.phase === 'restoring';
  const mfa = auth.phase === 'mfa';
  const locked = auth.phase === 'locked';
  return <KeyboardScrollView style={{ flex: 1, backgroundColor: colors.bg }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
    <View style={{ width: '100%', maxWidth: 460, alignSelf: 'center', gap: 30 }}>
      <Brand />
      <View style={{ gap: 12 }}><Text weight="semibold" style={{ letterSpacing: 2, fontSize: 11, color: colors.teal }}>CARE, WITHIN REACH</Text><Text accessibilityRole="header" weight="bold" style={{ fontSize: 36, lineHeight: 45 }}>{restoring ? 'Opening your\nworkspace.' : locked ? 'Welcome back.' : mfa ? 'One more\nsecure step.' : 'A little closer\nto your patients.'}</Text><Text style={{ color: colors.muted }}>{locked ? 'Unlock to return to your patients and conversations.' : mfa ? 'Enter the six-digit code from your authenticator app.' : 'Your patients, their progress, and your conversations. Together in one place.'}</Text></View>
      <Card style={{ gap: 20 }}>
        {!isConfigured && <Notice message="Connect this app to your existing Milestone project using the environment settings in the setup guide." />}
        {auth.error ? <Notice message={auth.error} /> : null}
        {auth.error.startsWith('Sign-out') && <Button secondary title="Retry sign-out" busy={auth.busy} onPress={() => void auth.logout()} />}
        {restoring ? <ActivityIndicator size="large" color={colors.teal} accessibilityLabel="Restoring your session" /> : locked ? <>
          <View style={{ alignItems: 'center', padding: 10 }}><Fingerprint size={50} color={colors.teal} /></View>
          <Button title={Platform.OS === 'web' ? 'Sign in to unlock' : 'Unlock workspace'} icon={<LockKeyhole size={18} color={colors.onAccent} />} busy={auth.busy} onPress={() => void auth.unlock()} />
          <Button secondary title="Sign out" disabled={auth.busy} onPress={() => void auth.logout()} />
        </> : mfa ? <>
          <Field label="Authentication code" value={code} onChangeText={setCode} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} editable={!auth.busy} onSubmitEditing={() => void auth.verifyMfa(code)} />
          <Button title="Verify and continue" busy={auth.busy} onPress={() => void auth.verifyMfa(code)} />
          <Button secondary title="Back to sign in" disabled={auth.busy} onPress={() => { setCode(''); void auth.logout(); }} />
        </> : <>
          <Field label="Work email" value={email} onChangeText={setEmail} placeholder="you@yourpractice.com" keyboardType="email-address" textContentType="username" autoComplete="email" autoCapitalize="none" editable={!auth.busy} />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="Your provider password" secureTextEntry textContentType="password" autoComplete="current-password" editable={!auth.busy} onSubmitEditing={() => { const value = password; setPassword(''); void auth.login(email, value); }} />
          <Button title="Sign in to your workspace" busy={auth.busy} disabled={!isConfigured} onPress={() => { const value = password; setPassword(''); void auth.login(email, value); }} />
          <Text style={{ fontSize: 12, lineHeight: 19, color: colors.muted }}>Use your existing provider account. Account creation, password recovery, and authenticator setup are available on the provider website.</Text>
          {webUrl && /^https:\/\//.test(webUrl) ? <Button secondary title="Open provider website" onPress={() => void Linking.openURL(webUrl)} /> : null}
        </>}
      </Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}><ShieldCheck size={17} color={colors.teal} /><Text style={{ fontSize: 12, color: colors.muted }}>Built around your care relationships</Text></View>
    </View>
  </KeyboardScrollView>;
}
