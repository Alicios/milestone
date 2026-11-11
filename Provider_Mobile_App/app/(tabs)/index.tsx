import React, { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { Archive, Search, UsersRound } from 'lucide-react-native';
import { useSession } from '../../src/auth/SessionProvider';
import { api } from '../../src/lib/client';
import { useResource } from '../../src/hooks/useResource';
import { Avatar, Brand, Button, Card, ChevronRight, Empty, Field, Heading, Notice, Screen, Text, styles } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function PatientsScreen() {
  const { provider } = useSession();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [archive, setArchive] = useState(false);
  const resource = useResource(`patients-${provider!.id}`, () => api.patients(provider!.id));
  const patients = (resource.data ?? []).filter(patient => Boolean(patient.dischargedAt) === archive && patient.name.toLowerCase().includes(search.trim().toLowerCase()));
  const activeCount = (resource.data ?? []).filter(patient => !patient.dischargedAt).length;
  return <Screen refreshControl={<RefreshControl refreshing={resource.loading && Boolean(resource.data)} onRefresh={() => void resource.refresh()} tintColor={colors.teal} />}>
    <View style={{ marginBottom: 30 }}><Brand compact /></View>
    <Heading eyebrow={`Hello, ${provider!.name.split(' ')[0]}`} title={archive ? 'Patient archive' : 'Your patients'} detail={archive ? 'Previous care relationships, kept within reach.' : 'A small check-in can make a meaningful difference.'}
      action={<Button secondary title={archive ? 'Active patients' : 'Archive'} icon={<Archive color={colors.teal} size={16} />} onPress={() => setArchive(value => !value)} />} />
    {!archive && <View style={[styles.card, { backgroundColor: colors.teal, borderColor: colors.teal, marginBottom: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}><View style={{ flex: 1, gap: 4 }}><Text weight="bold" style={{ color: colors.bg, fontSize: 28, lineHeight: 36 }}>{resource.data ? activeCount : '—'}</Text><Text weight="medium" style={{ color: colors.bg }}>patients in your care</Text></View><UsersRound size={40} color={colors.bg} strokeWidth={1.4} /></View>}
    <View style={{ marginBottom: 20 }}><Field label="Find a patient" value={search} onChangeText={setSearch} placeholder="Search by name" autoCapitalize="none" returnKeyType="search" /></View>
    {resource.error ? <Notice message={resource.error} onRetry={() => void resource.refresh()} /> : null}
    {resource.loading && !resource.data ? <ActivityIndicator accessibilityLabel="Loading patients" color={colors.teal} /> : null}
    <View style={{ gap: 12 }}>{patients.map(patient => <Pressable accessibilityRole="button" accessibilityLabel={`Open ${patient.name}`} key={patient.profileId} onPress={() => router.push({ pathname: '/patient/[profileId]', params: { profileId: patient.profileId } })} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}><Avatar name={patient.name} /><View style={{ flex: 1, gap: 3 }}><Text weight="semibold" style={{ fontSize: 16 }}>{patient.name}</Text><Text numberOfLines={2} style={{ color: colors.muted, fontSize: 12 }}>{patient.primaryConcern || patient.treatmentFocus || (archive ? 'Archived care relationship' : 'View care details and routines')}</Text></View><ChevronRight color={colors.teal} size={20} /></Card>
    </Pressable>)}</View>
    {!resource.loading && !resource.error && !patients.length && <Empty title={search ? 'No matching patients' : archive ? 'No archived patients' : 'Your caseload starts here'} detail={search ? 'Try another name or clear your search.' : archive ? 'Discharged patients will appear here.' : 'Patients added on the provider website will appear here.'} />}
  </Screen>;
}
