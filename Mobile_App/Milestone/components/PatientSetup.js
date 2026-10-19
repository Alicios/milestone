import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Text from './AppText';
import Brand from './Brand';
import CountryCodePicker from './CountryCodePicker';
import { callingCode, formatPhoneInput, getDevicePhoneCountry } from '../auth/phoneNumber';
import { createMockSession, findMockPatient, formatPhone, validateProfile } from '../auth/mockPatient';

function Field({ label, error, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor="#637D7B" style={[styles.input, props.editable === false && styles.readOnly, error && styles.invalid]} {...props} />
      {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export default function PatientSetup({ onComplete }) {
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState(getDevicePhoneCountry);
  const [patient, setPatient] = useState(null);
  const [phoneError, setPhoneError] = useState('');
  const [details, setDetails] = useState({ email: '', preferredName: '', dateOfBirth: '', pinEnabled: false, pin: '', confirmPin: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');

  function change(key, value) {
    setDetails(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: '' }));
    setSubmitError('');
  }

  function lookup() {
    try {
      setPatient(findMockPatient(phone, country));
      setPhoneError('');
    } catch (failure) {
      setPhoneError(failure.message);
    }
  }

  async function complete() {
    if (busy) return;
    const validation = validateProfile(details);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    setBusy(true);
    setSubmitError('');
    try {
      await onComplete(createMockSession(patient, details));
    } catch {
      setSubmitError('Unable to finish setup. Please try again.');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4EACF" />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.fill} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}><Brand /></View>
          <Text style={styles.eyebrow}>{patient ? 'A LITTLE ABOUT YOU' : 'YOUR NEXT MILESTONE STARTS HERE'}</Text>
          <Text accessibilityRole="header" style={styles.title}>{patient ? 'Make yourself at home.' : 'Welcome to Milestone.'}</Text>
          <Text style={styles.subtitle}>{patient ? 'We found your patient profile. Add a few details to get started.' : 'Enter the phone number you shared with your provider.'}</Text>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.cardTitle}>{patient ? 'Complete your profile' : 'Sign in with your phone'}</Text>
            {!patient ? (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Phone number</Text>
                  <View style={styles.phoneRow}>
                    <CountryCodePicker country={country} onChange={nextCountry => { setCountry(nextCountry); setPhone(value => formatPhoneInput(value, nextCountry)); setPhoneError(''); }} />
                    <TextInput accessibilityLabel="Phone number" value={phone} keyboardType="phone-pad" autoComplete="tel-national" textContentType="telephoneNumber" maxLength={30} placeholder={callingCode(country) === '1' ? '(000) 000-0000' : 'Phone number'} placeholderTextColor="#637D7B" style={[styles.input, styles.phoneInput, phoneError && styles.invalid]}
                      onChangeText={value => { setPhone(formatPhoneInput(value, country)); setPhoneError(''); }} onSubmitEditing={lookup} returnKeyType="go" />
                  </View>
                  {phoneError ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{phoneError}</Text> : null}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Continue" onPress={lookup} style={styles.primary}><Text style={styles.primaryText}>Continue</Text></Pressable>
              </>
            ) : (
              <>
                <Field label="Full name" value={patient.fullName} editable={false} />
                <Field label="Phone number" value={`+${patient.countryCallingCode ?? '1'} ${formatPhone(patient.phone)}`} editable={false} />
                <Field label="Email address" value={details.email} editable={!busy} onChangeText={value => change('email', value)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" placeholder="you@example.com" error={errors.email} />
                <Field label="Preferred name (optional)" value={details.preferredName} editable={!busy} onChangeText={value => change('preferredName', value)} autoCapitalize="words" maxLength={60} placeholder="What should we call you?" />
                <Field label="Date of birth (optional)" value={details.dateOfBirth} editable={!busy} onChangeText={value => change('dateOfBirth', value)} keyboardType="numbers-and-punctuation" placeholder="MM/DD/YYYY" maxLength={10} error={errors.dateOfBirth} />
                <View style={styles.pinOption}>
                  <Text style={styles.pinLabel}>Protect this app with a PIN</Text>
                  <Switch accessibilityLabel="Protect this app with a PIN" value={details.pinEnabled} disabled={busy} trackColor={{ true: '#357F83', false: '#B7CAC2' }} onValueChange={value => {
                    setDetails(current => ({ ...current, pinEnabled: value, pin: '', confirmPin: '' }));
                    setErrors(current => ({ ...current, pin: '', confirmPin: '' }));
                  }} />
                </View>
                <Text style={styles.hint}>Optional. Ask for your PIN when you reopen or lock Milestone.</Text>
                {details.pinEnabled && <>
                  <Field label="Create PIN" value={details.pin} editable={!busy} onChangeText={value => change('pin', value.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry maxLength={4} autoComplete="off" error={errors.pin} />
                  <Field label="Confirm PIN" value={details.confirmPin} editable={!busy} onChangeText={value => change('confirmPin', value.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry maxLength={4} autoComplete="off" error={errors.confirmPin} />
                </>}
                {submitError ? <Text accessibilityRole="alert" style={styles.error}>{submitError}</Text> : null}
                <Pressable accessibilityRole="button" accessibilityLabel="Finish setup" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={complete} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Finishing setup…' : 'Finish setup'}</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Back to phone number" disabled={busy} onPress={() => { setPatient(null); setDetails(current => ({ ...current, pin: '', confirmPin: '' })); setErrors({}); }} style={styles.back}><Text style={styles.backText}>Back to phone number</Text></Pressable>
              </>
            )}
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
  brand: { alignItems: 'center', marginBottom: 32 },
  eyebrow: { color: '#357F83', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textAlign: 'center', marginBottom: 10 },
  title: { color: '#193333', fontSize: 32, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#357F83', fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 10, marginBottom: 26 },
  card: { backgroundColor: '#FFFDF7', borderRadius: 24, borderWidth: 1, borderColor: '#D8DFD0', paddingHorizontal: '7%', paddingVertical: 26 },
  cardTitle: { color: '#193333', fontSize: 21, fontWeight: '700' },
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
