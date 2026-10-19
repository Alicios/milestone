import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Text from './AppText';
import Brand from './Brand';

function PinField({ label, value, onChangeText, disabled, onSubmitEditing }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder="4-digit PIN"
        placeholderTextColor="#637D7B"
        secureTextEntry
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={4}
        autoComplete="off"
        autoCorrect={false}
        editable={!disabled}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="go"
        style={styles.input}
      />
    </View>
  );
}

export default function UnlockScreen({ busy, error, onSubmit, onClearError }) {
  const [secret, setSecret] = useState('');
  const [validation, setValidation] = useState('');
  const disabled = busy;

  function submit() {
    if (disabled) return;
    setValidation('');
    if (!/^\d{4}$/.test(secret)) return setValidation('Enter your 4-digit PIN.');
    onSubmit(secret);
    setSecret('');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4EACF" />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.fill} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Brand />
          </View>

          <View style={styles.intro}>
            <Text style={styles.eyebrow}>YOUR NEXT MILESTONE STARTS HERE</Text>
            <Text accessibilityRole="header" style={styles.title}>Welcome back.</Text>
            <Text style={styles.subtitle}>Enter your PIN to continue.</Text>
          </View>

          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Enter your PIN</Text>
            <PinField
              label="Your PIN"
              value={secret}
              onChangeText={value => {
                setSecret(value.replace(/\D/g, ''));
                setValidation('');
                onClearError();
              }}
              disabled={busy}
              onSubmitEditing={submit}
            />

            {(validation || error) && (
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
                {validation || error}
              </Text>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Unlock Milestone"
              accessibilityState={{ disabled, busy }}
              disabled={disabled}
              onPress={submit}
              style={[styles.primary, disabled && styles.disabled]}
            >
              {busy ? <ActivityIndicator color="#FFFDF7" accessibilityLabel="Checking unlock" /> : (
                <Text style={styles.primaryText}>Unlock</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.footer}>Move well. Feel better.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#F4EACF' },
  page: { width: '90%', maxWidth: 440, alignSelf: 'center', flexGrow: 1, justifyContent: 'center', paddingVertical: 32 },
  brand: { alignItems: 'center', marginBottom: 42 },
  intro: { alignItems: 'center', marginBottom: 28 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: '#357F83', textAlign: 'center', marginBottom: 10 },
  title: { fontSize: 34, fontWeight: '800', color: '#193333', textAlign: 'center' },
  subtitle: { color: '#357F83', fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 8 },
  card: { backgroundColor: '#FFFDF7', borderRadius: 24, borderWidth: 1, borderColor: '#D8DFD0', paddingHorizontal: '7%', paddingVertical: 26 },
  cardTitle: { color: '#193333', fontSize: 21, fontWeight: '700', marginBottom: 8 },
  field: { marginTop: 18 },
  label: { fontSize: 13, fontWeight: '600', color: '#193333', marginBottom: 8 },
  input: { width: '100%', minHeight: 56, borderRadius: 13, borderWidth: 1.5, borderColor: '#B7CAC2', backgroundColor: '#FFFDF7', paddingHorizontal: '5%', paddingVertical: 14, fontSize: 20, letterSpacing: 8, color: '#193333', textAlign: 'center' },
  error: { color: '#A83E14', fontSize: 13, lineHeight: 20, marginTop: 14 },
  primary: { backgroundColor: '#193333', borderRadius: 14, minHeight: 56, padding: 14, marginTop: 22, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFDF7', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.5 },
  footer: { color: '#357F83', fontSize: 12, textAlign: 'center', marginTop: 32 },
});
