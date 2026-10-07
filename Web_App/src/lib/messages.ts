import { supabase } from './supabase'

export type Message = {
  id: string
  text: string
  from: 'patient' | 'provider'
  createdAt: string
}

export type Conversation = {
  id: string
  name: string
  initials: string
  preview: string
  lastMessageAt: string | null
  unread: number
  starred: boolean
  messages: Message[]
}

type ProfileRow = { id: string; patient_id: string }
type PatientRow = { id: string; name: string }
type MessageRow = {
  id: string
  patient_profile_id: string
  sender_kind: Message['from']
  body: string
  created_at: string
}
type StateRow = { patient_profile_id: string; last_read_at: string | null; starred: boolean }

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0]?.[0] ?? '?').toUpperCase()
}

export async function loadMessageConversations(providerId: string): Promise<Conversation[]> {
  const { data: profiles, error: profileError } = await supabase
    .from('provider_patient_profiles')
    .select('id, patient_id')
    .eq('provider_id', providerId)
  if (profileError) throw profileError
  if (!profiles?.length) return []

  const profileIds = (profiles as ProfileRow[]).map((profile) => profile.id)
  const patientIds = (profiles as ProfileRow[]).map((profile) => profile.patient_id)
  const [patientResult, messageResult, stateResult] = await Promise.all([
    supabase.from('patients').select('id, name').in('id', patientIds),
    supabase.from('messages')
      .select('id, patient_profile_id, sender_kind, body, created_at')
      .in('patient_profile_id', profileIds)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    supabase.from('message_thread_state')
      .select('patient_profile_id, last_read_at, starred')
      .in('patient_profile_id', profileIds)
      .eq('participant_user_id', providerId),
  ])
  if (patientResult.error) throw patientResult.error
  if (messageResult.error) throw messageResult.error
  if (stateResult.error) throw stateResult.error

  const patients = new Map(((patientResult.data ?? []) as PatientRow[]).map((patient) => [patient.id, patient]))
  const states = new Map(((stateResult.data ?? []) as StateRow[]).map((state) => [state.patient_profile_id, state]))
  const messagesByProfile = new Map<string, MessageRow[]>()
  for (const message of (messageResult.data ?? []) as MessageRow[]) {
    const rows = messagesByProfile.get(message.patient_profile_id) ?? []
    rows.push(message)
    messagesByProfile.set(message.patient_profile_id, rows)
  }

  return ((profiles ?? []) as ProfileRow[]).flatMap((profile) => {
    const patient = patients.get(profile.patient_id)
    if (!patient) return []
    const rows = messagesByProfile.get(profile.id) ?? []
    const last = rows.at(-1)
    const state = states.get(profile.id)
    return [{
      id: profile.id,
      name: patient.name,
      initials: initials(patient.name),
      preview: last?.body ?? 'No messages yet',
      lastMessageAt: last?.created_at ?? null,
      unread: rows.filter((row) =>
        row.sender_kind === 'patient' && (!state?.last_read_at || row.created_at > state.last_read_at),
      ).length,
      starred: state?.starred ?? false,
      messages: rows.map((row) => ({
        id: row.id,
        text: row.body,
        from: row.sender_kind,
        createdAt: row.created_at,
      })),
    }]
  }).sort((first, second) =>
    (second.lastMessageAt ?? '').localeCompare(first.lastMessageAt ?? '') || first.name.localeCompare(second.name),
  )
}

export async function sendProviderMessage(patientProfileId: string, body: string) {
  const { error } = await supabase.from('messages').insert({
    patient_profile_id: patientProfileId,
    sender_kind: 'provider',
    body: body.trim(),
  })
  if (error) throw error
}

export async function markMessageThreadRead(patientProfileId: string, latestDisplayedAt: string) {
  const { error } = await supabase.from('message_thread_state')
    .update({ last_read_at: latestDisplayedAt })
    .eq('patient_profile_id', patientProfileId)
  if (error) throw error
}

export async function setMessageThreadStarred(patientProfileId: string, starred: boolean) {
  const { error } = await supabase.from('message_thread_state')
    .update({ starred })
    .eq('patient_profile_id', patientProfileId)
  if (error) throw error
}
