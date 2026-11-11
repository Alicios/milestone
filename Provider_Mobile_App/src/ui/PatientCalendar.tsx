import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Check, CircleAlert, CircleCheck, CircleX, Clock3, Play, Plus, TriangleAlert } from 'lucide-react-native';
import type { Assignment } from '../types';
import { formatDate, type RoutineStatus } from '../lib/domain';
import { routineColors, routinePresentation } from '../lib/routinePresentation';
import { Text } from './components';
import { useTheme } from './theme';

type Presentation = NonNullable<ReturnType<typeof routinePresentation>>;
export function RoutineIndicator({ presentation, small = false }: { presentation: Presentation; small?: boolean }) {
  const { mode } = useTheme();
  const [backgroundColor, color] = routineColors(presentation.status, mode);
  const Icon = presentation.status === 'critical' ? CircleAlert : presentation.status === 'completed' ? CircleCheck : presentation.status === 'issue' ? TriangleAlert : presentation.status === 'inProgress' ? Play : presentation.status === 'missed' ? CircleX : Clock3;
  return <View style={{ backgroundColor, borderRadius: 9, padding: small ? 6 : 9, gap: 5 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>{presentation.completed && presentation.issue && <Check size={small ? 13 : 16} color={color} />}<Icon size={small ? 14 : 17} color={color} /><Text weight="semibold" style={{ color, fontSize: small ? 10 : 11, lineHeight: small ? 15 : 17, flexShrink: 1 }}>{presentation.label}</Text></View>
  </View>;
}
export function RoutineLegend() {
  const { mode } = useTheme();
  const labels: [RoutineStatus, string][] = [['completed', 'Completed'], ['issue', 'Completed with issues'], ['inProgress', 'In progress'], ['issue', 'Issue reported'], ['critical', 'Critical issue'], ['missed', 'Missed'], ['neutral', 'Assigned']];
  return <View accessibilityLabel="Routine status legend" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{labels.map(([status, label]) => {
    const [backgroundColor, color] = routineColors(status, mode);
    return <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor, borderWidth: 1, borderColor: color }} /><Text style={{ fontSize: 10, lineHeight: 16 }}>{label}</Text></View>;
  })}</View>;
}
export function PatientCalendar({ dates, selectedDay, assignments, today, loading, onDay, onAssignment, onAssign, canAssign }: {
  dates: string[]; selectedDay: string; assignments: Assignment[]; today?: string; loading: boolean;
  onDay(date: string): void; onAssignment(assignment: Assignment): void; onAssign?(date: string): void; canAssign?(date: string): boolean;
}) {
  const { colors } = useTheme();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const revealSelected = () => {
    const index = dates.indexOf(selectedDay);
    if (index >= 0 && viewportWidth > 0) scroll.current?.scrollTo({ x: Math.max(0, index * 140 - (viewportWidth - 132) / 2), animated: false });
  };
  useEffect(revealSelected, [selectedDay, dates[0], viewportWidth]);
  return <ScrollView ref={scroll} onLayout={event => setViewportWidth(event.nativeEvent.layout.width)} onContentSizeChange={revealSelected} horizontal showsHorizontalScrollIndicator contentContainerStyle={{ gap: 8, paddingBottom: 8, alignItems: 'stretch' }}>{dates.map(date => {
    const selected = selectedDay === date;
    const rows = assignments.filter(item => item.scheduledDate === date && item.status !== 'cancelled');
    return <View key={date} style={{ width: 132, backgroundColor: colors.surface, borderColor: selected ? colors.teal : colors.border, borderWidth: selected ? 2 : 1, borderRadius: 15, overflow: 'hidden' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })} accessibilityState={{ selected }} aria-selected={selected} onPress={() => onDay(date)} style={{ padding: 10, gap: 3, alignItems: 'center', backgroundColor: selected ? colors.soft : colors.surface }}><Text style={{ color: colors.muted, fontSize: 11 }}>{formatDate(date, { weekday: 'short' })}</Text><Text weight="bold" style={{ color: colors.teal, fontSize: 22, lineHeight: 29 }}>{date.slice(-2)}</Text>{date === today && <Text weight="semibold" style={{ color: colors.teal, fontSize: 9, lineHeight: 14 }}>Today</Text>}</Pressable>
      <View style={{ padding: 7, gap: 7, flex: 1 }}>{loading ? <Text style={{ fontSize: 11, color: colors.muted }}>Loading…</Text> : rows.length ? rows.map(assignment => {
        const presentation = routinePresentation(assignment, today)!;
        return <Pressable key={assignment.id} accessibilityRole="button" accessibilityLabel={`${assignment.routineName}, ${presentation.label}, ${formatDate(date)}`} onPress={() => onAssignment(assignment)} style={{ gap: 5, minHeight: 70 }}><Text weight="semibold" numberOfLines={2} style={{ fontSize: 11, lineHeight: 16 }}>{assignment.routineName}</Text><RoutineIndicator presentation={presentation} small /></Pressable>;
      }) : <Pressable accessibilityRole="button" accessibilityLabel={`Assign routine on ${formatDate(date, { month: 'long', day: 'numeric' })}`} disabled={!(canAssign?.(date) ?? false)} onPress={() => onAssign?.(date)} style={{ minHeight: 70, alignItems: 'center', justifyContent: 'center', gap: 5, opacity: (canAssign?.(date) ?? false) ? 1 : 0.6 }}>{(canAssign?.(date) ?? false) && <Plus size={19} color={colors.teal} />}<Text style={{ color: colors.muted, fontSize: 11 }}>{(canAssign?.(date) ?? false) ? 'Assign routine' : 'No routine'}</Text></Pressable>}</View>
    </View>;
  })}</ScrollView>;
}
