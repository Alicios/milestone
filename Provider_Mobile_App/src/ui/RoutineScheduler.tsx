import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useResource } from '../hooks/useResource';
import { createSchedulingApi, definitiveFailure, parsePending, schedulingError, withinHorizon, type Preview, type ScheduleOperation } from '../lib/scheduling';
import { sessionStorage, supabase } from '../lib/supabase';
import { formatDate } from '../lib/domain';
import type { Assignment } from '../types';
import { ActionSheet } from './ActionSheet';
import { Button, Card, Field, Notice, Text } from './components';
import { useTheme } from './theme';

export const scheduling = createSchedulingApi(supabase);
export type ScheduleIntent = { date: string; assignment?: Assignment; remove?: boolean };

export function RoutineScheduler({ providerId, profileId, intent, onClose, onSaved, onBlocked }: {
  providerId: string; profileId: string; intent: ScheduleIntent | null;
  onClose(): void; onSaved(): void; onBlocked(blocked: boolean): void;
}) {
  const { colors } = useTheme();
  const routines = useResource(`saved-routines-${providerId}`, () => scheduling.routines(providerId));
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<ScheduleOperation | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const active = useRef(true);
  const epoch = useRef(0);
  const callbacks = useRef({ onClose, onSaved, onBlocked });
  callbacks.current = { onClose, onSaved, onBlocked };
  const key = `provider-schedule-${providerId}-${profileId}`;
  useEffect(() => { active.current = true; return () => { active.current = false; ++epoch.current; }; }, []);
  useEffect(() => { setPreview(null); setSearch(''); setError(''); ++epoch.current; }, [intent]);
  useEffect(() => { callbacks.current.onBlocked(!ready || busy || Boolean(pending)); }, [ready, busy, pending]);

  async function complete(operation: ScheduleOperation) {
    await sessionStorage.removeItem(key);
    if (!active.current) return;
    setPending(null); setMessage(operation.previous ? operation.entry ? 'Routine changed.' : 'Routine removed.' : 'Routine assigned.');
    setError(''); callbacks.current.onClose(); callbacks.current.onSaved();
  }
  // Reconcile saved receipts on return. A read never retries a write automatically.
  useFocusEffect(React.useCallback(() => {
    let mounted = true;
    async function restore() {
      if (running.current) return;
      running.current = true;
      try {
        const raw = await sessionStorage.getItem(key);
        if (!mounted || !active.current) return;
        if (raw) {
          const operation = parsePending(raw, providerId, profileId);
          setPending(operation);
          const receipt = await scheduling.receipt(operation);
          if (!mounted || !active.current) return;
          if (receipt) await complete(operation);
          else setError('A saved request needs checking. Retry the same request to finish it safely.');
        }
        if (mounted && active.current) setReady(true);
      } catch {
        if (mounted && active.current) setError('The saved request could not be checked. Reopen this patient page when connected.');
      } finally { running.current = false; }
    }
    void restore();
    return () => { mounted = false; };
  }, [key, providerId, profileId]));

  async function choose(routineId: string) {
    if (!intent || running.current) return;
    const current = ++epoch.current;
    running.current = true; setBusy(true); setPreview(null); setError('');
    try {
      const result = await scheduling.preview(profileId, intent.date, routineId);
      if (!active.current || current !== epoch.current) return;
      if (result.entries.length !== 1 || result.entries[0].routineId !== routineId || result.entries[0].date !== intent.date
        || !withinHorizon(intent.date, result.policy)) throw new Error('Invalid preview');
      if (result.conflicts.some(row => row.assignmentId !== intent.assignment?.id || row.assignmentId == null)) {
        setError('This day already has an assignment. Refresh the patient schedule.'); return;
      }
      setPreview(result);
    } catch (cause) { if (active.current && current === epoch.current) setError(schedulingError(cause)); }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  async function save(retry = false, checkOnly = false) {
    if (running.current || (!ready && !pending)) return;
    let operation = pending;
    if (!operation) {
      if (!intent || (!intent.remove && !preview)) return;
      const entry = preview?.entries[0];
      operation = { providerId, patientProfileId: profileId, requestId: randomUUID(),
        entry: intent.remove ? null : { date: entry!.date, routineId: entry!.routineId, token: entry!.token },
        previous: intent.assignment ? { id: intent.assignment.id, updatedAt: intent.assignment.updatedAt! } : undefined };
    }
    running.current = true; setBusy(true); setError(''); setMessage('');
    let submitted = false;
    try {
      // Durably retain the confirmed UUID and preview before sending anything.
      await sessionStorage.setItem(key, JSON.stringify(operation));
      if (active.current) setPending(operation);
      if (retry || checkOnly) {
        const receipt = await scheduling.receipt(operation);
        if (receipt) { await complete(operation); return; }
        if (checkOnly) { if (active.current) setError('No receipt yet. You can retry this same saved request.'); return; }
      }
      submitted = true;
      await scheduling.submit(operation);
      await complete(operation);
    } catch (cause) {
      if (submitted && definitiveFailure(cause)) {
        try { await sessionStorage.removeItem(key); if (active.current) setPending(null); } catch { /* Keep recovery blocked if storage cannot be cleared. */ }
        if (active.current) { setPreview(null); callbacks.current.onSaved(); }
      }
      if (active.current) setError(schedulingError(cause));
    } finally { running.current = false; if (active.current) { setBusy(false); setReady(true); } }
  }
  const currentEntry = preview?.entries[0];
  const title = intent?.remove ? 'Remove routine' : intent?.assignment ? 'Change routine' : 'Assign routine';
  return <>
    {message ? <Text accessibilityRole="status" style={{ color: colors.teal }}>{message}</Text> : null}
    {pending ? <Card><Text weight="semibold">Saved schedule request</Text><Text style={{ fontSize: 13 }}>Check its result before making another change.</Text>{error ? <Notice message={error} /> : null}<Button secondary busy={busy} title="Check saved request" onPress={() => void save(false, true)} /><Button disabled={busy} title="Retry same request" onPress={() => void save(true)} /></Card> : !intent && error ? <Notice message={error} /> : null}
    <ActionSheet dialog visible={Boolean(intent) && !pending} title={title} onClose={() => { if (!busy) onClose(); }}>
      <View style={{ gap: 14, padding: 6 }}>
        <Text weight="semibold">{intent ? formatDate(intent.date, { weekday: 'long', month: 'short', day: 'numeric' }) : ''}</Text>
        {error ? <Notice message={error} /> : null}
        {intent?.remove ? <><Text>Remove {intent.assignment?.routineName} from this day?</Text><Text style={{ color: colors.muted, fontSize: 13 }}>The cancelled assignment remains in care history. Scheduled follow-ups are cancelled.</Text><Button title="Confirm removal" busy={busy} disabled={!ready} onPress={() => void save()} /></> : currentEntry ? <>
          <Text weight="semibold">{currentEntry.routineName}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{intent?.assignment ? `Replaces ${intent.assignment.routineName} on this day. Its scheduled follow-ups will be cancelled.` : 'Review this prescription before assigning.'}</Text>
          {currentEntry.exercises.map((exercise, index) => <View key={index} style={{ gap: 4 }}><Text weight="semibold" style={{ fontSize: 13 }}>{index + 1}. {exercise.name}</Text><Text style={{ fontSize: 12 }}>{[exercise.sets != null ? `${exercise.sets} sets` : '', exercise.reps != null ? `${exercise.reps} reps` : '', exercise.durationSeconds != null ? `${exercise.durationSeconds} seconds` : ''].filter(Boolean).join(' · ') || 'No dosage specified'}</Text>{exercise.notes && <Text style={{ color: colors.muted, fontSize: 12 }}>{exercise.notes}</Text>}</View>)}
          <Button title={intent?.assignment ? 'Confirm replacement' : 'Confirm assignment'} busy={busy} disabled={!ready} onPress={() => void save()} />
          <Button secondary title="Choose another routine" disabled={busy} onPress={() => setPreview(null)} />
        </> : <>
          <Field label="Search saved routines" value={search} onChangeText={setSearch} autoCapitalize="none" />
          {routines.error ? <Notice message={routines.error} onRetry={() => void routines.refresh()} /> : null}
          {(routines.loading || busy) && <ActivityIndicator color={colors.teal} accessibilityLabel="Loading saved routine" />}
          {!routines.loading && !routines.error && !routines.data?.length && <Text>No saved routines yet. Create one in the web app.</Text>}
          {routines.data?.filter(row => row.id !== intent?.assignment?.routineId && `${row.name} ${row.description ?? ''}`.toLowerCase().includes(search.toLowerCase())).map(row => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`Preview ${row.name}`} disabled={busy} onPress={() => void choose(row.id)} style={{ paddingVertical: 12, minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text weight="semibold">{row.name}</Text>{row.description && <Text style={{ fontSize: 12, color: colors.muted }}>{row.description}</Text>}</Pressable>)}
        </>}
      </View>
    </ActionSheet>
  </>;
}
