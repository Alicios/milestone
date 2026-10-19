import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, findNodeHandle, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import X from 'lucide-react-native/icons/x';
import Text from './AppText';
import ProfileAvatar from './ProfileAvatar';
import { useAppTheme, useThemedStyles } from './AppTheme';
import { usePatientSession } from '../auth/PatientSession';
import { chooseProfilePhoto } from '../auth/profilePhoto';
import { formatPhone } from '../auth/mockPatient';

function Field({ label, error, ...props }) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useAppTheme();
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={[styles.input, props.editable === false && styles.readOnly]} {...props} />{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View>;
}

function Action({ label, onPress, secondary = false, disabled = false }) {
  const styles = useThemedStyles(baseStyles);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[secondary ? styles.secondary : styles.primary, disabled && styles.disabled]}><Text style={secondary ? styles.secondaryText : styles.primaryText}>{label}</Text></Pressable>;
}

function SettingsTab({ visible }) {
  const { session, preferences, updatePreferences, changePin } = usePatientSession();
  const styles = useThemedStyles(baseStyles);
  const { colors } = useAppTheme();
  const [pinAction, setPinAction] = useState(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinMessage, setPinMessage] = useState('');
  const [time, setTime] = useState(preferences.reminders.time);
  const [reminderError, setReminderError] = useState('');
  const pinEnabled = Boolean(session.pin);

  function cancelPin() { setPinAction(null); setCurrentPin(''); setNewPin(''); setConfirmPin(''); setPinError(''); }
  useEffect(() => { if (!visible) cancelPin(); }, [visible]);
  useEffect(() => { setTime(preferences.reminders.time); }, [preferences.reminders.time]);

  function submitPin() {
    setPinError('');
    if (pinAction !== 'disable' && (!/^\d{4}$/.test(newPin) || newPin !== confirmPin)) { setPinError('Choose a 4-digit PIN and make sure both PINs match.'); return; }
    try {
      changePin({ currentPin, newPin: pinAction === 'disable' ? null : newPin });
      setPinMessage(pinAction === 'disable' ? 'PIN protection disabled.' : pinAction === 'enable' ? 'PIN protection enabled.' : 'PIN updated.');
      cancelPin();
    } catch (failure) { setPinError(failure.message); }
  }

  function setReminder(patch) {
    try { updatePreferences({ reminders: { ...preferences.reminders, ...patch } }); setReminderError(''); }
    catch (failure) { setReminderError(failure.message); }
  }

  return <>
    <Text accessibilityRole="header" style={styles.sectionTitle}>Security</Text>
    <View style={styles.switchRow}><Text style={styles.switchLabel}>Protect this app with a PIN</Text><Switch accessibilityLabel="Protect this app with a PIN" value={pinEnabled} trackColor={{ true: colors.primary, false: colors.border }} onValueChange={value => { cancelPin(); setPinMessage(''); setPinAction(value ? 'enable' : 'disable'); }} /></View>
    <Text style={styles.hint}>Ask for your PIN when you reopen or lock Milestone.</Text>
    {pinEnabled && !pinAction && <Action label="Change PIN" secondary onPress={() => { setPinMessage(''); setPinAction('change'); }} />}
    {pinAction && <View style={styles.inset}>
      <Text style={styles.label}>{pinAction === 'disable' ? 'Disable PIN protection' : pinAction === 'enable' ? 'Create a PIN' : 'Choose a new PIN'}</Text>
      {pinEnabled && <Field label="Current PIN" value={currentPin} onChangeText={value => { setCurrentPin(value.replace(/\D/g, '')); setPinError(''); }} keyboardType="number-pad" secureTextEntry autoComplete="off" maxLength={4} />}
      {pinAction !== 'disable' && <><Field label="New PIN" value={newPin} onChangeText={value => { setNewPin(value.replace(/\D/g, '')); setPinError(''); }} keyboardType="number-pad" secureTextEntry autoComplete="off" maxLength={4} /><Field label="Confirm new PIN" value={confirmPin} onChangeText={value => { setConfirmPin(value.replace(/\D/g, '')); setPinError(''); }} keyboardType="number-pad" secureTextEntry autoComplete="off" maxLength={4} /></>}
      {pinError ? <Text accessibilityRole="alert" style={styles.error}>{pinError}</Text> : null}
      <Action label={pinAction === 'disable' ? 'Disable PIN' : 'Save PIN'} onPress={submitPin} /><Action label="Cancel PIN change" secondary onPress={cancelPin} />
    </View>}
    {pinMessage ? <Text accessibilityRole="alert" style={styles.hint}>{pinMessage}</Text> : null}

    <Text accessibilityRole="header" style={styles.sectionTitle}>Appearance</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={styles.appearance}>
      {[['light', 'Light'], ['dark', 'Dark'], ['system', 'Follow device']].map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={label} aria-checked={preferences.appearance === value} accessibilityState={{ checked: preferences.appearance === value }} onPress={() => updatePreferences({ appearance: value })} style={[styles.choice, preferences.appearance === value && styles.selectedChoice]}><Text style={[styles.choiceText, preferences.appearance === value && styles.selectedChoiceText]}>{label}</Text></Pressable>)}
    </View>

    <Text accessibilityRole="header" style={styles.sectionTitle}>Exercise reminders</Text>
    <View style={styles.switchRow}><Text style={styles.switchLabel}>Reminder preview</Text><Switch accessibilityLabel="Exercise reminders" value={preferences.reminders.enabled} trackColor={{ true: colors.primary, false: colors.border }} onValueChange={enabled => setReminder({ enabled, time: enabled ? time : preferences.reminders.time })} /></View>
    <Text style={styles.hint}>Mock preview only. These settings do not send notifications.</Text>
    <Text style={[styles.label, styles.daysLabel]}>Reminder days</Text>
    <View style={styles.days}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, day) => <Pressable key={label} accessibilityRole="checkbox" accessibilityLabel={label} aria-checked={preferences.reminders.days.includes(day)} accessibilityState={{ checked: preferences.reminders.days.includes(day) }} onPress={() => setReminder({ days: preferences.reminders.days.includes(day) ? preferences.reminders.days.filter(item => item !== day) : [...preferences.reminders.days, day].sort() })} style={[styles.day, preferences.reminders.days.includes(day) && styles.selectedChoice]}><Text style={[styles.dayText, preferences.reminders.days.includes(day) && styles.selectedChoiceText]}>{label}</Text></Pressable>)}</View>
    <Field label="Reminder time (HH:MM)" value={time} placeholder="09:00" keyboardType="numbers-and-punctuation" maxLength={5} onChangeText={value => { setTime(value); if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) setReminder({ time: value }); }} onBlur={() => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) setReminderError('Enter a valid time as HH:MM (24-hour time).'); }} />
    <Text style={styles.hint}>Uses your device's local time zone.</Text>
    {reminderError ? <Text accessibilityRole="alert" style={styles.error}>{reminderError}</Text> : null}
  </>;
}

export default function ProfileSettingsPanel({ visible, onClose }) {
  const { session, storageWarning, updateProfile } = usePatientSession();
  const profile = session.profile;
  const styles = useThemedStyles(baseStyles);
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('profile');
  const [draft, setDraft] = useState(() => ({ email: profile.email, preferredName: profile.preferredName, photoUri: profile.photoUri || null }));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [present, setPresent] = useState(visible);
  const translation = useRef(new Animated.Value(900)).current;
  const reducedMotion = useRef(false);
  const title = useRef(null);
  const dialog = useRef(null);
  const mounted = useRef(true);
  const closing = useRef(false);
  const dismissRef = useRef(null);
  const dirty = draft.email !== profile.email || draft.preferredName !== profile.preferredName || draft.photoUri !== (profile.photoUri || null);

  useEffect(() => {
    mounted.current = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reducedMotion.current = value; });
    return () => { mounted.current = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    let active = true;
    if (visible) {
      setPresent(true);
      AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
        if (!active) return;
        reducedMotion.current = reduced;
        translation.setValue(reduced ? 0 : 900);
        Animated.timing(translation, { toValue: 0, duration: reduced ? 0 : 260, useNativeDriver: Platform.OS !== 'web' }).start();
      }).catch(() => translation.setValue(0));
    } else { setPresent(false); translation.stopAnimation(); }
    return () => { active = false; };
  }, [visible, translation]);

  function finishClose() {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(translation, { toValue: 900, duration: reducedMotion.current ? 0 : 220, useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => { if (finished && mounted.current) { setPresent(false); onClose(); } });
  }
  function requestDismiss() {
    translation.setValue(0);
    if (photoBusy) return;
    if (dirty) setDiscard(true); else finishClose();
  }
  dismissRef.current = requestDismiss;

  const drag = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => translation.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => { if (gesture.dy > 80 || gesture.vy > 0.8) dismissRef.current(); else if (reducedMotion.current) translation.setValue(0); else Animated.spring(translation, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start(); },
    onPanResponderTerminate: () => translation.setValue(0),
  })).current;

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return undefined;
    const keyboard = event => {
      if (event.key === 'Escape') { event.preventDefault(); dismissRef.current(); }
      if (event.key === 'Tab') {
        const nodes = [...(dialog.current?.querySelectorAll('button, input, [tabindex="0"]') || [])].filter(node => node.getClientRects().length && !node.disabled && node.getAttribute('aria-disabled') !== 'true');
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [visible]);

  function focusTitle() {
    if (Platform.OS === 'web') title.current?.focus?.();
    else { const handle = findNodeHandle(title.current); if (handle) AccessibilityInfo.setAccessibilityFocus(handle); }
  }

  async function pickPhoto() {
    if (photoBusy) return;
    setPhotoBusy(true); setError(''); setMessage('');
    try { const photoUri = await chooseProfilePhoto(); if (photoUri && mounted.current) setDraft(previous => ({ ...previous, photoUri })); }
    catch { if (mounted.current) setError('Unable to read your photo. Check photo access or choose another image.'); }
    finally { if (mounted.current) setPhotoBusy(false); }
  }

  function edit(key, value) { setDraft(previous => ({ ...previous, [key]: value })); setError(''); setMessage(''); }
  function save() {
    try { updateProfile(draft); setDraft(previous => ({ ...previous, email: previous.email.trim(), preferredName: previous.preferredName.trim() })); setError(''); setMessage('Profile saved.'); }
    catch (failure) { setError(failure.message); }
  }

  return <Modal visible={present && visible} transparent animationType="none" onShow={focusTitle} onRequestClose={requestDismiss}>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss profile panel" onPress={requestDismiss} style={styles.backdrop} />
      <Animated.View ref={dialog} accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12), transform: [{ translateY: translation }] }]}>
        <View {...drag.panHandlers} style={styles.handleArea}><View style={styles.handle} /></View>
        <View style={styles.header}><Text ref={title} tabIndex={-1} accessibilityRole="header" style={styles.title}>Your account</Text><Pressable accessibilityRole="button" accessibilityLabel="Close profile and settings" onPress={requestDismiss} style={styles.close}><X size={24} color={colors.text} accessible={false} /></Pressable></View>
        <View accessibilityRole="tablist" style={styles.tabs}>{[['profile', 'Profile'], ['settings', 'Settings']].map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={label} aria-selected={tab === value} accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.activeTab, tab === value && { borderBottomColor: colors.primary }]}><Text style={[styles.tabText, tab === value && styles.activeTabText]}>{label}</Text></Pressable>)}</View>
        {discard ? <View style={styles.confirmation}><Text accessibilityRole="header" style={styles.sectionTitle}>Discard profile edits?</Text><Text style={styles.hint}>Your unsaved profile changes will be lost.</Text><Action label="Keep editing" onPress={() => setDiscard(false)} /><Action label="Discard changes" secondary onPress={finishClose} /></View> : <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {storageWarning ? <Text accessibilityRole="alert" style={styles.error}>{storageWarning}</Text> : null}
          <View style={tab !== 'profile' && styles.hidden} importantForAccessibility={tab === 'profile' ? 'auto' : 'no-hide-descendants'}>
            <View style={styles.photoSection}><ProfileAvatar profile={{ ...profile, ...draft }} size={88} /><Action label={draft.photoUri ? 'Change profile photo' : 'Add profile photo'} secondary disabled={photoBusy} onPress={pickPhoto} />{draft.photoUri && <Action label="Remove profile photo" secondary disabled={photoBusy} onPress={() => edit('photoUri', null)} />}{photoBusy && <Text style={styles.hint}>Preparing photo…</Text>}</View>
            <Field label="Full name" value={profile.fullName} editable={false} />
            <Field label="Phone number" value={`+${profile.countryCallingCode || '1'} ${formatPhone(profile.phone)}`} editable={false} />
            <Field label="Preferred name" value={draft.preferredName} onChangeText={value => edit('preferredName', value)} maxLength={60} autoCapitalize="words" />
            <Field label="Email address" value={draft.email} onChangeText={value => edit('email', value)} keyboardType="email-address" autoComplete="email" autoCorrect={false} autoCapitalize="none" />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}{message ? <Text accessibilityRole="alert" style={styles.hint}>{message}</Text> : null}
            <Action label="Save profile" disabled={photoBusy} onPress={save} /><Action label="Cancel" secondary disabled={photoBusy} onPress={requestDismiss} />
          </View>
          <View style={tab !== 'settings' && styles.hidden} importantForAccessibility={tab === 'settings' ? 'auto' : 'no-hide-descendants'}><SettingsTab visible={visible && tab === 'settings'} /></View>
        </ScrollView>}
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
}

const baseStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,35,35,0.55)' },
  sheet: { width: '100%', maxWidth: 720, height: '88%', maxHeight: '94%', alignSelf: 'center', backgroundColor: '#FFFDF7', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  handleArea: { height: 28, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#B7CAC2' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  title: { color: '#193333', fontSize: 24, fontWeight: '800' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', marginHorizontal: 24, marginTop: 12, borderBottomWidth: 1, borderBottomColor: '#B7CAC2' },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#357F83' },
  tabText: { color: '#357F83', fontSize: 15, fontWeight: '600' },
  activeTabText: { color: '#193333', fontWeight: '800' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
  hidden: { display: 'none' },
  photoSection: { alignItems: 'center', paddingTop: 16 },
  field: { marginTop: 18 },
  label: { color: '#193333', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { minHeight: 52, borderRadius: 12, borderWidth: 1.5, borderColor: '#B7CAC2', backgroundColor: '#FFFDF7', color: '#193333', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  readOnly: { backgroundColor: '#EDF2E9' },
  primary: { marginTop: 18, minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 12, backgroundColor: '#193333' },
  primaryText: { color: '#FFFDF7', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  secondary: { marginTop: 10, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#B7CAC2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  secondaryText: { color: '#357F83', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  sectionTitle: { color: '#193333', fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 12 },
  hint: { color: '#357F83', fontSize: 12, lineHeight: 19, marginTop: 8 },
  error: { color: '#A83E14', fontSize: 13, lineHeight: 20, marginTop: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { flex: 1, color: '#193333', fontSize: 14, fontWeight: '600' },
  inset: { padding: 14, marginTop: 12, backgroundColor: '#EDF2E9', borderRadius: 14 },
  appearance: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { flexGrow: 1, minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#B7CAC2', alignItems: 'center', justifyContent: 'center' },
  selectedChoice: { backgroundColor: '#193333' },
  choiceText: { color: '#193333', fontSize: 13, fontWeight: '600' },
  selectedChoiceText: { color: '#FFFDF7' },
  daysLabel: { marginTop: 20 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: { minWidth: 44, width: '22%', minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: '#B7CAC2', alignItems: 'center', justifyContent: 'center', padding: 8 },
  dayText: { color: '#193333', fontSize: 12, fontWeight: '600' },
  confirmation: { paddingHorizontal: 24, paddingBottom: 24 },
  disabled: { opacity: 0.5 },
});
