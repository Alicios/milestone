import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, MessageCircle, CalendarDays } from 'lucide-react-native';
import { useSession } from '../../src/auth/SessionProvider';
import { useResource } from '../../src/hooks/useResource';
import { api } from '../../src/lib/client';
import { formatDate, localDateKey, resolveRoutineStatus, weekDates } from '../../src/lib/domain';
import { Avatar, Button, Card, Detail, Empty, Heading, Notice, Screen, StatusPill, Text } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function PatientScreen() {
  const { profileId: parameter } = useLocalSearchParams<{ profileId: string }>();
  const profileId = Array.isArray(parameter) ? parameter[0] : parameter;
  const { provider } = useSession();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [offset, setOffset] = useState(0);
  const [today, setToday] = useState(localDateKey());
  const dates = weekDates(offset);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const day = selectedDay && dates.includes(selectedDay) ? selectedDay : dates.includes(today) ? today : dates[0];
  const patients = useResource(`patient-${provider!.id}-${profileId}`, () => api.patients(provider!.id));
  const routines = useResource(`assignments-${profileId}-${dates[0]}`, () => api.assignments(profileId, dates[0], dates[6]));
  const patient = patients.data?.find(item => item.profileId === profileId);
  const assignments = (routines.data ?? []).filter(item => item.scheduledDate === day);
  useEffect(() => { const timer = setInterval(() => setToday(localDateKey()), 30000); return () => clearInterval(timer); }, []);
  const refresh = () => { void patients.refresh(); void routines.refresh(); setToday(localDateKey()); };
  const moveWeek = (change: number) => { setOffset(value => value + change); setSelectedDay(null); setExpanded(null); };
  return <Screen refreshControl={<RefreshControl refreshing={Boolean(patient) && (patients.loading || routines.loading)} onRefresh={refresh} tintColor={colors.teal} />}>
    <Heading back eyebrow="Patient workspace" title={patient?.name ?? 'Patient details'} detail={patient?.dischargedAt ? 'Archived care relationship · Read only' : 'An overview of care, one day at a time.'} />
    {patients.error ? <Notice message={patients.error} onRetry={refresh} /> : null}
    {patients.loading && !patient && <ActivityIndicator color={colors.teal} accessibilityLabel="Loading patient" />}
    {!patients.loading && !patients.error && !patient && <Empty title="Patient unavailable" detail="This patient relationship is not accessible to your account. Return to your patient list and refresh." />}
    {patient && <View style={{ gap: 22 }}>
      <Card><View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}><Avatar name={patient.name} size={58} /><View style={{ flex: 1 }}><Text weight="bold" style={{ fontSize: 20, lineHeight: 28 }}>{patient.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{patient.dischargedAt ? 'Archived' : patient.careStatus || 'Active care'}</Text></View></View>
        <View style={{ flexDirection: width >= 760 ? 'row' : 'column', gap: 24 }}><View style={{ flex: width >= 760 ? 1 : undefined, gap: 18 }}><Detail label="Primary concern" value={patient.primaryConcern} /><Detail label="Treatment focus" value={patient.treatmentFocus} /><Detail label="Start of care" value={patient.startOfCare ? formatDate(patient.startOfCare, { month: 'long', day: 'numeric', year: 'numeric' }) : null} /></View><View style={{ flex: width >= 760 ? 1 : undefined, gap: 18 }}><Detail label="Email" value={patient.email} /><Detail label="Phone" value={patient.phone} />{patient.dischargedAt && <Detail label="Discharged" value={new Date(patient.dischargedAt).toLocaleDateString()} />}</View></View>
        <Button secondary title="Open conversation" icon={<MessageCircle size={18} color={colors.teal} />} onPress={() => router.push({ pathname: '/conversation/[profileId]', params: { profileId } })} />
      </Card>
      <View style={{ gap: 14 }}><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}><View style={{ flex: 1, minWidth: 150 }}><Text accessibilityRole="header" weight="bold" style={{ fontSize: 21 }}>Assigned routines</Text><Text style={{ color: colors.muted, fontSize: 12 }}>Prescriptions and patient feedback</Text></View><Button secondary title="This week" onPress={() => { setOffset(0); setSelectedDay(null); setExpanded(null); }} /></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous week" onPress={() => moveWeek(-1)} style={{ padding: 12, minHeight: 44 }}><ChevronLeft size={22} color={colors.teal} /></Pressable>
          <Text weight="semibold" style={{ flex: 1, textAlign: 'center', fontSize: 15 }}>{formatDate(dates[0], { month: 'long', year: 'numeric' })}{dates[0].slice(0, 7) !== dates[6].slice(0, 7) ? ` – ${formatDate(dates[6], { month: 'long', year: 'numeric' })}` : ''}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next week" onPress={() => moveWeek(1)} style={{ padding: 12, minHeight: 44 }}><ChevronRight size={22} color={colors.teal} /></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>{dates.map(date => {
          const count = (routines.data ?? []).filter(item => item.scheduledDate === date).length;
          const selected = day === date;
          return <Pressable key={date} accessibilityRole="button" accessibilityLabel={formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })} accessibilityState={{ selected }} onPress={() => { setSelectedDay(date); setExpanded(null); }} style={{ backgroundColor: selected ? colors.teal : colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 15, width: 82, paddingVertical: 12, paddingHorizontal: 8, gap: 5, alignItems: 'center' }}>
            <Text style={{ color: selected ? colors.bg : colors.muted, fontSize: 11 }}>{formatDate(date, { weekday: 'short' })}</Text><Text weight="bold" style={{ color: selected ? colors.bg : colors.ink, fontSize: 22, lineHeight: 29 }}>{date.slice(-2)}</Text><Text style={{ color: selected ? colors.bg : colors.muted, fontSize: 10 }}>{routines.loading ? '…' : `${count} routine${count === 1 ? '' : 's'}`}</Text>
          </Pressable>;
        })}</ScrollView>
        <Text weight="semibold" style={{ color: colors.teal }}>{formatDate(day, { weekday: 'long', month: 'short', day: 'numeric' })}{day === today ? ' · Today' : ''}</Text>
        {routines.error ? <Notice message={routines.error} onRetry={() => void routines.refresh()} /> : null}
        {routines.loading && !routines.data && <ActivityIndicator color={colors.teal} accessibilityLabel="Loading routines" />}
        {assignments.map(assignment => {
          const status = resolveRoutineStatus(assignment, today);
          const open = expanded === assignment.id;
          return <Card key={assignment.id}><Pressable accessibilityRole="button" accessibilityLabel={`${assignment.routineName}, ${status?.label}`} accessibilityState={{ expanded: open }} onPress={() => setExpanded(open ? null : assignment.id)} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><CalendarDays size={20} color={colors.teal} /><Text weight="semibold" style={{ flex: 1, fontSize: 17 }}>{assignment.routineName}</Text><ChevronRight size={20} color={colors.teal} style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }} /></View>
            {status && <StatusPill {...status} />}<Text style={{ fontSize: 12, color: colors.muted }}>{assignment.exercises.length} exercises · {open ? 'Hide details' : 'View routine and feedback'}</Text>
          </Pressable>
          {open && <View style={{ gap: 18 }}>
            {assignment.patientResult?.source === 'demo' && <Text style={{ color: colors.muted, fontSize: 12 }}>Demonstration result</Text>}
            {assignment.patientResult?.comment && <Detail label="Patient routine comment" value={assignment.patientResult.comment} />}
            {assignment.exerciseFeedbackError && <Notice message={assignment.exerciseFeedbackError} onRetry={() => void routines.refresh()} />}
            {!assignment.exercises.length && <Text>No exercise snapshots are available for this assignment.</Text>}
            {assignment.exercises.map((exercise, index) => <View key={exercise.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, gap: 9 }}>
              <Text weight="semibold">{index + 1}. {exercise.name}</Text><Text style={{ color: colors.muted, fontSize: 13 }}>{[exercise.sets != null ? `${exercise.sets} sets` : '', exercise.reps != null ? `${exercise.reps} reps` : '', exercise.durationSeconds != null ? `${exercise.durationSeconds} seconds` : ''].filter(Boolean).join(' · ') || 'No dosage recorded'}</Text>
              {exercise.notes && <Detail label="Provider notes" value={exercise.notes} />}
              {exercise.patientFeedback ? <View style={{ padding: 14, borderRadius: 12, backgroundColor: colors.soft, gap: 7 }}><Text weight="semibold" style={{ fontSize: 13 }}>Patient feedback</Text><Text style={{ fontSize: 13 }}>Pain {exercise.patientFeedback.painScore}/10 · Feeling {exercise.patientFeedback.feeling}</Text>{exercise.patientFeedback.explanation && <Text selectable style={{ fontSize: 13 }}>{exercise.patientFeedback.explanation}</Text>}<Text style={{ color: colors.muted, fontSize: 11 }}>Reported {new Date(exercise.patientFeedback.reportedAt).toLocaleString()}</Text></View>
                : <Text style={{ color: colors.muted, fontSize: 12 }}>{assignment.exerciseFeedbackError ? 'Feedback unavailable' : 'No feedback reported yet'}</Text>}
            </View>)}
          </View>}
          </Card>;
        })}
        {!routines.loading && !routines.error && !assignments.length && <Empty title="A clear day" detail="No routines are assigned for this date. Choose another day or week to review more care history." />}
      </View>
    </View>}
  </Screen>;
}
