import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowUpRight, CircleAlert, CircleCheck } from 'lucide-react-native';
import { useSession } from '../../src/auth/SessionProvider';
import { useResource } from '../../src/hooks/useResource';
import { api } from '../../src/lib/client';
import { formatDate, localDateKey } from '../../src/lib/domain';
import { homeDateRange, loadHomeActivity, type Activity, type CareIssue } from '../../src/lib/home';
import { scheduling } from '../../src/ui/RoutineScheduler';
import { Brand, Button, Card, Empty, Heading, Notice, Screen, Text } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function HomeScreen() {
  const { provider } = useSession();
  const { colors } = useTheme();
  const [today, setToday] = useState(localDateKey());
  const policy = useResource(`home-policy-${provider!.id}`, () => scheduling.policy(), 60000);
  const date = policy.data?.today ?? today;
  const resource = useResource(`home-${provider!.id}-${date}`, () => loadHomeActivity(api, provider!.id, date), 30000);
  useEffect(() => { const timer = setInterval(() => setToday(localDateKey()), 30000); return () => clearInterval(timer); }, []);
  const data = resource.data;
  const refresh = () => { void resource.refresh(); void policy.refresh(); setToday(localDateKey()); };
  const open = ({ patient, assignment }: Activity) => router.push({ pathname: '/patient/[profileId]', params: { profileId: patient.profileId, date: assignment.scheduledDate, assignmentId: assignment.id } });
  const demo = (row: Activity) => row.assignment.patientResult?.source === 'demo' ? <Text weight="semibold" style={{ color: colors.teal, fontSize: 12 }}>Simulated result</Text> : null;
  const issueCard = (row: CareIssue) => <Pressable key={`${row.assignment.id}-${row.exercise?.id ?? 'routine'}`} accessibilityRole="button" accessibilityLabel={`Review ${row.patient.name}, ${row.exercise?.name ?? row.assignment.routineName}`} onPress={() => open(row)}>
    <Card style={{ borderColor: row.critical ? colors.error : colors.accent }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><CircleAlert color={row.critical ? colors.error : colors.accent} size={24} /><Text weight="bold" style={{ flex: 1, fontSize: 18 }}>{row.patient.name}</Text><ArrowUpRight color={colors.teal} size={20} /></View>
      <Text weight="semibold" style={{ color: row.critical ? colors.error : colors.ink }}>{row.critical ? 'Critical issue reported' : 'Exercise issue reported'}</Text>
      <Text weight="semibold" style={{ fontSize: 18 }}>{row.exercise?.name ?? row.assignment.routineName}</Text>
      <Text style={{ color: colors.muted }}>{row.assignment.routineName} | {formatDate(row.assignment.scheduledDate)}</Text>
      {row.exercise?.patientFeedback ? <><Text>{row.exercise.patientFeedback.explanation || 'The patient reported difficulty with this exercise.'}</Text><Text weight="semibold">Pain {row.exercise.patientFeedback.painScore}/10 | {row.exercise.patientFeedback.feeling === 'difficult' ? 'Difficult' : row.exercise.patientFeedback.feeling === 'neutral' ? 'Neutral' : 'Good'}</Text></> : <Text>{row.assignment.patientResult?.comment || 'Open the patient page to review this routine.'}</Text>}
      {row.assignment.status === 'completed' && <Text style={{ color: colors.teal }}>Routine completed with an issue</Text>}
      {demo(row)}
      <Text weight="semibold" style={{ color: colors.teal }}>Review patient</Text>
    </Card>
  </Pressable>;
  return <Screen refreshControl={<RefreshControl refreshing={resource.loading && Boolean(data)} onRefresh={refresh} tintColor={colors.teal} />}>
    <View style={{ marginBottom: 24 }}><Brand compact /></View>
    <Heading eyebrow={`Hello, ${provider!.name.split(' ')[0]}`} title="Home" detail={formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })} />
    {resource.error ? <Notice message={resource.error} onRetry={refresh} /> : null}
    {resource.loading && !data && <ActivityIndicator color={colors.teal} accessibilityLabel="Loading care overview" />}
    {data && <View style={{ gap: 24 }}>
      <Text style={{ color: colors.muted }}>Last 7 days | {formatDate(homeDateRange(date).from)} | {formatDate(date)}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>{[[data.patients, 'Patients'], [data.completed.length, 'Completed'], [data.feedbackUnavailable ? '-' : data.issues.length, 'To review']].map(([value, label]) => <Card key={label} style={{ flex: 1, padding: 10, gap: 8 }}><Text weight="bold" style={{ fontSize: 26, lineHeight: 34 }}>{value}</Text><Text style={{ fontSize: 11, lineHeight: 17 }}>{label}</Text></Card>)}</View>
      <View style={{ gap: 14 }}><Text accessibilityRole="header" weight="bold" style={{ fontSize: 22, lineHeight: 30 }}>Needs attention</Text><Text style={{ color: colors.muted, fontSize: 13 }}>Reported routine issues, difficult exercises, or exercise pain of 7/10 or higher.</Text>
        {data.feedbackUnavailable && <Notice message="Some exercise feedback could not be loaded. The overview may be incomplete." onRetry={refresh} />}
        {data.issues.map(issueCard)}
        {!data.issues.length && !data.feedbackUnavailable && !resource.error && <Empty title="No issues reported" detail="No routine or exercise issues were reported in the last 7 days." />}
      </View>
      <View style={{ gap: 14 }}><Text accessibilityRole="header" weight="bold" style={{ fontSize: 22, lineHeight: 30 }}>Recent completions</Text>
        {data.completed.slice(0, 10).map(row => <Pressable key={row.assignment.id} accessibilityRole="button" accessibilityLabel={`View completed ${row.assignment.routineName} for ${row.patient.name}`} onPress={() => open(row)}><Card><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><CircleCheck color={colors.teal} size={24} /><View style={{ flex: 1, gap: 4 }}><Text weight="semibold" style={{ fontSize: 18 }}>{row.patient.name}</Text><Text>{row.assignment.routineName}</Text></View><ArrowUpRight color={colors.teal} size={20} /></View><Text style={{ color: colors.muted }}>{formatDate(row.assignment.scheduledDate)} | Completed</Text>{demo(row)}</Card></Pressable>)}
        {!data.completed.length && !resource.error && <Empty title="No completions yet" detail="Completed routines from the last 7 days will appear here." />}
      </View>
      <Button secondary title="View all patients" onPress={() => router.navigate('/patients')} />
    </View>}
  </Screen>;
}
