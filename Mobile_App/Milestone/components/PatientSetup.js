import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Text from './AppText';
import Brand from './Brand';
import { useAppTheme, useThemedStyles } from './AppTheme';
import ProfileAvatar from './ProfileAvatar';
import { chooseProfilePhoto } from '../auth/profilePhoto';
import { formatPhone, validateProfile } from '../auth/profileValidation';

function Field({ label, error, ...props }) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={[styles.input, props.editable === false && styles.readOnly, error && styles.invalid]} {...props} />
      {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

// Rendered once, right after a patient's first real sign-in (see UnlockGate's
// needsLocalSetup branch) — `patient` is their real name/phone from the
// backend (see auth/PatientSession.js), shown read-only here. This used to
// start with a phone-number lookup against a hardcoded mock patient; that's
// gone now that sign-in itself identifies a real patient.
export default function PatientSetup({ patient, onComplete }) {
  const styles = useThemedStyles(baseStyles);
  const { colors, barStyle } = useAppTheme();
  const [details, setDetails] = useState({ preferredName: '', dateOfBirth: '', photoUri: null, pinEnabled: false, pin: '', confirmPin: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const disabled = busy || photoBusy;

  async function pickPhoto() {
    if (disabled) return;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      const photoUri = await chooseProfilePhoto();
      if (photoUri) change('photoUri', photoUri);
    } catch {
      setPhotoError('Unable to open or read your photo. Check photo access in your device settings or try another image.');
    } finally {
      setPhotoBusy(false);
    }
  }

  function change(key, value) {
    setDetails(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: '' }));
    setSubmitError('');
  }

  async function complete() {
    if (disabled) return;
    const validation = validateProfile(details);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    setBusy(true);
    setSubmitError('');
    try {
      await onComplete({
        preferredName: details.preferredName.trim(),
        dateOfBirth: details.dateOfBirth.trim(),
        photoUri: details.photoUri || null,
        pin: details.pinEnabled ? details.pin : null,
      });
    } catch {
      setSubmitError('Unable to finish setup. Please try again.');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={barStyle} backgroundColor={colors.background} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.fill} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}><Brand /></View>
          <Text style={styles.eyebrow}>A LITTLE ABOUT YOU</Text>
          <Text accessibilityRole="header" style={styles.title}>Make yourself at home.</Text>
          <Text style={styles.subtitle}>Add a few details to get started.</Text>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Complete your profile</Text>
            <View style={styles.photoSection}>
              <Text style={styles.label}>Profile photo (optional)</Text>
              <ProfileAvatar profile={{ ...patient, preferredName: details.preferredName.trim(), photoUri: details.photoUri }} size={88} />
              <Pressable accessibilityRole="button" accessibilityLabel={details.photoUri ? 'Change profile photo' : 'Add profile photo'} accessibilityState={{ disabled, busy: photoBusy }} disabled={disabled} onPress={pickPhoto} style={styles.photoButton}>
                <Text style={styles.backText}>{photoBusy ? 'Preparing photo…' : details.photoUri ? 'Change photo' : 'Add photo'}</Text>
              </Pressable>
              {details.photoUri && <Pressable accessibilityRole="button" accessibilityLabel="Remove profile photo" disabled={disabled} onPress={() => { change('photoUri', null); setPhotoError(''); }} style={styles.removePhoto}><Text style={styles.removeText}>Remove photo</Text></Pressable>}
              {photoError ? <Text accessibilityRole="alert" style={styles.error}>{photoError}</Text> : null}
            </View>
            <Field label="Full name" value={patient?.fullName || ''} editable={false} />
            {patient?.phone ? <Field label="Phone number" value={formatPhone(patient.phone)} editable={false} /> : null}
            <Field label="Preferred name (optional)" value={details.preferredName} editable={!busy} onChangeText={value => change('preferredName', value)} autoCapitalize="words" maxLength={60} placeholder="What should we call you?" />
            <Field label="Date of birth (optional)" value={details.dateOfBirth} editable={!busy} onChangeText={value => change('dateOfBirth', value)} keyboardType="numbers-and-punctuation" placeholder="MM/DD/YYYY" maxLength={10} error={errors.dateOfBirth} />
            <View style={styles.pinOption}>
              <Text style={styles.pinLabel}>Protect this app with a PIN</Text>
              <Switch accessibilityLabel="Protect this app with a PIN" value={details.pinEnabled} disabled={busy} trackColor={{ true: colors.primary, false: colors.border }} onValueChange={value => {
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
            <Pressable accessibilityRole="button" accessibilityLabel="Finish setup" accessibilityState={{ disabled, busy: disabled }} disabled={disabled} onPress={complete} style={[styles.primary, disabled && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Finishing setup…' : 'Finish setup'}</Text></Pressable>
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
  cardTitle: { color: '#193333', fontSize: 21, fontWeight: '700' },
  photoSection: { alignItems: 'center', marginTop: 24 },
  photoButton: { minHeight: 44, paddingHorizontal: 16, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: '#B7CAC2', justifyContent: 'center', alignItems: 'center' },
  removePhoto: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  removeText: { color: '#A83E14', fontSize: 12, fontWeight: '600' },
  field: { marginTop: 18 },
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
  backText: { color: '#357F83', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.5 },
  footer: { color: '#357F83', fontSize: 12, textAlign: 'center', marginTop: 28 },
});
