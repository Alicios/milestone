import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { api } from '../lib/client';
import { appointmentError, appointmentTimes, type Appointment } from '../lib/appointments';
import { localDateKey } from '../lib/domain';
import { useResource } from '../hooks/useResource';
import { ActionSheet } from './ActionSheet';
import { Button, Card, Empty, Field, Notice, Text } from './components';
import { useTheme } from './theme';

export function HomeAppointments({ providerId, refreshKey }: { providerId: string; refreshKey: number }) {
  const { colors } = useTheme();
  const visits = useResource(`appointments-${providerId}-${refreshKey}`, () => api.appointments(providerId), 30000);
  const patients = useResource(`appointment-patients-${providerId}`, () => api.patients(providerId));
  const [show, setShow] = useState(false);
  const [search, setSearch] = useState('');
  const [profile, setProfile] = useState('');
  const [date, setDate] = useState(localDateKey());
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState('30');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const pending = useRef<Appointment | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [cancelId, setCancelId] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const names = new Map(patients.data?.map(patient => [patient.profileId, patient.name]));
  const active = patients.data?.filter(patient => !patient.dischargedAt) ?? [];
  const close = () => { if (!saving.current) setShow(false); };

  async function save() {
    if (saving.current) return;
    setError(''); setNotice('');
    if (!pending.current) {
      if (!active.some(patient => patient.profileId === profile) || patients.error || patients.loading) { setError('Choose an active patient after the patient list has loaded.'); return; }
      try {
        const times = appointmentTimes(date.trim(), time.trim(), duration.trim());
        pending.current = { id: randomUUID(), provider_id: providerId, patient_profile_id: profile, ...times, location: location.trim(), status: 'scheduled' };
      } catch (cause) { setError((cause as Error).message); return; }
    }
    saving.current = true; setBusy(true);
    try {
      await api.createAppointment(pending.current);
      pending.current = null; setUncertain(false); setShow(false); setProfile(''); setSearch(''); setLocation('');
      setNotice('Appointment booked.'); void visits.refresh();
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      const definitive = code && /^(22|23|42)/.test(code);
      if (definitive) { pending.current = null; setUncertain(false); }
      else setUncertain(true);
      setError(appointmentError(cause));
    } finally { saving.current = false; setBusy(false); }
  }
  async function cancel() {
    if (saving.current) return;
    saving.current = true; setCancelling(true); setCancelError('');
    try { await api.cancelAppointment(cancelId, providerId); setCancelId(''); setNotice('Appointment cancelled.'); void visits.refresh(); }
    catch { setCancelError('Could not cancel this appointment. Try again.'); }
    finally { saving.current = false; setCancelling(false); }
  }
  const locked = busy || uncertain;
  return <View style={{ gap: 14, marginVertical: 24 }}>
    <Text accessibilityRole="header" weight="bold" style={{ fontSize: 22, lineHeight: 30 }}>Upcoming appointments</Text>
    <Button title={uncertain ? 'Resume appointment booking' : 'Make appointment'} onPress={() => { setShow(true); if (!uncertain) setError(''); void patients.refresh(); }} />
    <Text style={{ color: colors.muted, fontSize: 12 }}>Times shown in {timezone}.</Text>
    {notice ? <Text accessibilityRole="alert" style={{ color: colors.teal }}>{notice}</Text> : null}
    {visits.error ? <Notice message={visits.error} onRetry={() => void visits.refresh()} /> : null}
    {patients.error ? <Notice message={patients.error} onRetry={() => void patients.refresh()} /> : null}
    {visits.loading && !visits.data && <ActivityIndicator accessibilityLabel="Loading appointments" color={colors.teal} />}
    {visits.data?.map(visit => <Card key={visit.id}>
      <Text weight="bold" style={{ fontSize: 18 }}>{names.get(visit.patient_profile_id) ?? 'Patient appointment'}</Text>
      <Text>{new Date(visit.starts_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text>
      <Text style={{ color: colors.muted }}>{Math.round((Date.parse(visit.ends_at) - Date.parse(visit.starts_at)) / 60000)} minutes{visit.location ? ` | ${visit.location}` : ''}</Text>
      <Button secondary title="View patient" onPress={() => router.push({ pathname: '/patient/[profileId]', params: { profileId: visit.patient_profile_id } })} />
      <Button secondary title={`Cancel appointment with ${names.get(visit.patient_profile_id) ?? 'patient'}`} onPress={() => { setCancelError(''); setCancelId(visit.id); }} />
    </Card>)}
    {!visits.loading && !visits.error && !visits.data?.length && <Empty title="No upcoming appointments" detail="Book a visit with a patient to see it here." />}
    <ActionSheet visible={show} title="Make appointment" dialog onClose={close}>
      <View style={{ gap: 16 }}>
        <Text style={{ color: colors.muted }}>Enter the date and time in {timezone}.</Text>
        {patients.loading && <ActivityIndicator accessibilityLabel="Loading appointment patients" color={colors.teal} />}
        {patients.error ? <Notice message={patients.error} onRetry={() => void patients.refresh()} /> : null}
        <Field label="Find appointment patient" value={search} onChangeText={setSearch} editable={!locked} />
        <View style={{ gap: 8 }}>{active.filter(patient => patient.name.toLowerCase().includes(search.toLowerCase())).map(patient => <Pressable key={patient.profileId} accessibilityRole="radio" accessibilityState={{ checked: profile === patient.profileId, disabled: locked }} disabled={locked} onPress={() => setProfile(patient.profileId)} style={{ minHeight: 48, padding: 12, borderWidth: profile === patient.profileId ? 2 : 1, borderRadius: 12, borderColor: profile === patient.profileId ? colors.teal : colors.border, backgroundColor: profile === patient.profileId ? colors.soft : colors.surface }}><Text weight={profile === patient.profileId ? 'bold' : 'regular'}>{patient.name}</Text></Pressable>)}</View>
        {!patients.loading && !patients.error && !active.length && <Text>Add an active patient on the provider website before booking.</Text>}
        <Field label="Appointment date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="2026-12-01" autoCapitalize="none" editable={!locked} />
        <Field label="Appointment time (HH:MM, 24-hour)" value={time} onChangeText={setTime} placeholder="09:00" autoCapitalize="none" editable={!locked} />
        <Field label="Duration (minutes)" value={duration} onChangeText={setDuration} keyboardType="number-pad" editable={!locked} />
        <Field label="Location (optional)" value={location} onChangeText={setLocation} maxLength={300} editable={!locked} />
        {error ? <Notice message={error} /> : null}
        {uncertain && <Text>The last booking may have saved. Retry to confirm it without creating a duplicate.</Text>}
        <Button title={uncertain ? 'Retry same booking' : 'Book appointment'} busy={busy} disabled={!uncertain && (patients.loading || Boolean(patients.error) || !active.length)} onPress={() => void save()} />
      </View>
    </ActionSheet>
    <ActionSheet visible={Boolean(cancelId)} title="Cancel appointment" dialog onClose={() => { if (!cancelling) setCancelId(''); }}>
      <View style={{ gap: 16 }}><Text>Cancel this appointment? The time will become available for another visit.</Text>{cancelError ? <Notice message={cancelError} /> : null}<Button title="Confirm cancellation" busy={cancelling} onPress={() => void cancel()} /><Button secondary title="Keep appointment" disabled={cancelling} onPress={() => setCancelId('')} /></View>
    </ActionSheet>
  </View>;
}
