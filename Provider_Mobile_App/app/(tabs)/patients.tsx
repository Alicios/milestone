import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, RefreshControl, View } from 'react-native';
import { Link } from 'expo-router';
import { Archive, ArrowDownAZ, ArrowUpAZ, Check, SlidersHorizontal } from 'lucide-react-native';
import { useSession } from '../../src/auth/SessionProvider';
import { api } from '../../src/lib/client';
import { localDateKey, weekDates } from '../../src/lib/domain';
import { filterPatients, patientFilters, type PatientFilter } from '../../src/lib/patientFilters';
import { useResource } from '../../src/hooks/useResource';
import { ActionSheet } from '../../src/ui/ActionSheet';
import { Avatar, Brand, Button, Card, ChevronRight, Empty, Field, Heading, Notice, Screen, Text } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function PatientsScreen() {
  const { provider } = useSession();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [archive, setArchive] = useState(false);
  const [filter, setFilter] = useState<PatientFilter>('all');
  const [descending, setDescending] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [today, setToday] = useState(localDateKey());
  useEffect(() => { const timer = setInterval(() => setToday(localDateKey()), 30000); return () => clearInterval(timer); }, []);
  const resource = useResource(`patients-${provider!.id}`, () => api.patients(provider!.id));
  const dates = weekDates(0, new Date(`${today}T12:00:00`));
  const profileIds = (resource.data ?? []).filter(patient => !patient.dischargedAt).map(patient => patient.profileId).sort();
  const needsStatuses = !archive && filter !== 'all';
  const statuses = useResource(`patient-filters-${provider!.id}-${dates[0]}-${needsStatuses ? profileIds.join(',') : 'off'}`, () => needsStatuses ? api.assignmentStatuses(profileIds, dates[0], dates[6]) : Promise.resolve([]));
  const waiting = needsStatuses && statuses.loading;
  const filterError = needsStatuses ? statuses.error : '';
  const patients = waiting || filterError ? [] : filterPatients(resource.data ?? [], statuses.data ?? [], { query: search, archive, filter, descending, today });
  const label = patientFilters.find(option => option.value === filter)!.label;
  const refresh = () => { setToday(localDateKey()); void resource.refresh(); if (needsStatuses) void statuses.refresh(); };
  return <Screen refreshControl={<RefreshControl refreshing={Boolean(resource.data) && (resource.loading || waiting)} onRefresh={refresh} tintColor={colors.teal} />}>
    <View style={{ marginBottom: 26 }}><Brand compact /></View>
    <Heading eyebrow={`Hello, ${provider!.name.split(' ')[0]}`} title={archive ? 'Patient archive' : 'Your patients'}
      action={<Button secondary title={archive ? 'Active patients' : 'Archive'} icon={<Archive color={colors.teal} size={16} />} onPress={() => { setArchive(value => !value); setSearch(''); setFilter('all'); }} />} />
    <View style={{ gap: 12, marginBottom: 20 }}><Field label="Find a patient" value={search} onChangeText={setSearch} placeholder="Search by name" autoCapitalize="none" returnKeyType="search" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {!archive && <Button secondary={filter === 'all'} title="Filter" icon={<SlidersHorizontal color={filter === 'all' ? colors.teal : colors.onAccent} size={17} />} onPress={() => { Keyboard.dismiss(); setFilterOpen(true); }} />}
        <Button secondary title={descending ? 'Name Z–A' : 'Name A–Z'} icon={descending ? <ArrowUpAZ color={colors.teal} size={17} /> : <ArrowDownAZ color={colors.teal} size={17} />} onPress={() => setDescending(value => !value)} />
      </View>
      {!archive && filter !== 'all' && <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}><Text style={{ fontSize: 12, color: colors.teal, flexShrink: 1 }}>{label} · This week</Text><Pressable accessibilityRole="button" onPress={() => setFilter('all')} style={{ minHeight: 44, justifyContent: 'center' }}><Text weight="semibold" style={{ fontSize: 12, color: colors.teal }}>Clear filter</Text></Pressable></View>}
    </View>
    {resource.error ? <Notice message={resource.error} onRetry={refresh} /> : null}
    {filterError ? <Notice message="Patient routine statuses could not be loaded. Try again or clear the filter." onRetry={() => void statuses.refresh()} /> : null}
    {(resource.loading && !resource.data || waiting) && <ActivityIndicator accessibilityLabel="Loading patients" color={colors.teal} />}
    <View style={{ gap: 12 }}>{patients.map(patient => <Link key={patient.profileId} href={{ pathname: '/patient/[profileId]', params: { profileId: patient.profileId } }} asChild><Pressable accessibilityLabel={`Open ${patient.name}`} accessibilityHint="Opens patient details and assigned routines" style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}><Avatar name={patient.name} /><View style={{ flex: 1, gap: 3 }}><Text weight="semibold" style={{ fontSize: 16 }}>{patient.name}</Text><Text numberOfLines={2} style={{ color: colors.muted, fontSize: 12 }}>{patient.primaryConcern || patient.treatmentFocus || (archive ? 'Archived care relationship' : 'View care details and routines')}</Text></View><ChevronRight color={colors.teal} size={20} /></Card>
    </Pressable></Link>)}</View>
    {!resource.loading && !resource.error && !waiting && !filterError && !patients.length && <Empty title={search || filter !== 'all' ? 'No matching patients' : archive ? 'No archived patients' : 'Your patients will appear here'} detail={search || filter !== 'all' ? 'Try another name or clear your filters.' : archive ? 'Discharged patients will appear here.' : 'Patients added on the provider website will appear here.'} />}
    <ActionSheet visible={filterOpen} title="Filter patients" onClose={() => setFilterOpen(false)} footer={<Text style={{ color: colors.muted, fontSize: 11, padding: 8 }}>Based on routines assigned for the current week.</Text>}>
      {patientFilters.map(option => <Pressable key={option.value} accessibilityRole="menuitem" accessibilityLabel={option.label} accessibilityState={{ selected: filter === option.value }} onPress={() => { setFilter(option.value); setFilterOpen(false); }} style={({ pressed }) => ({ minHeight: 48, padding: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed || filter === option.value ? colors.soft : 'transparent' })}><Text style={{ flex: 1, fontSize: 13 }}>{option.label}</Text>{filter === option.value && <Check color={colors.teal} size={17} />}</Pressable>)}
    </ActionSheet>
  </Screen>;
}
