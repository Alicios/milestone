import { AppError, normalizeError } from './errors'
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
}

type InboxRow = {
  patient_profile_id: string
  patient_name: string
  last_body: string | null
  last_message_at: string | null
  unread_count: number | string
  starred: boolean
}
type MessageRow = {
  id: string
  sender_kind: Message['from']
  body: string
  created_at: string
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0]?.[0] ?? '?').toUpperCase()
}

export async function loadMessageHistory(patientProfileId: string): Promise<Message[]> {
  try {
    const rows: MessageRow[] = []
    for (let offset = 0; ; offset += 500) {
      const { data, error, status } = await supabase.from('messages')
        .select('id, sender_kind, body, created_at')
        .eq('patient_profile_id', patientProfileId)
        .order('created_at', { ascending: true }).order('id', { ascending: true })
        .range(offset, offset + 499)
      if (error) throw normalizeError(error, { operation: 'loadMessageHistory', status })
      rows.push(...((data ?? []) as MessageRow[]))
      if (!data || data.length < 500) break
    }
    return rows.map((row) => ({ id: row.id, text: row.body, from: row.sender_kind, createdAt: row.created_at }))
  } catch (error) {
    throw normalizeError(error, { operation: 'loadMessageHistory' })
  }
}

export async function loadMessageConversations(): Promise<Conversation[]> {
  try {
    const rows: InboxRow[] = []
    // The RPC scopes results to auth.uid(); callers cannot choose another provider.
    for (let offset = 0; ; offset += 500) {
      const { data, error, status } = await supabase.rpc('get_provider_message_inbox')
        .range(offset, offset + 499)
      if (error) throw normalizeError(error, { operation: 'loadMessageConversations', status })
      rows.push(...((data ?? []) as InboxRow[]))
      if (!data || data.length < 500) break
    }
    return rows.map((row) => ({
      id: row.patient_profile_id,
      name: row.patient_name,
      initials: initials(row.patient_name),
      preview: row.last_body ?? 'No messages yet',
      lastMessageAt: row.last_message_at,
      unread: Number(row.unread_count),
      starred: row.starred,
    }))
  } catch (error) {
    throw normalizeError(error, { operation: 'loadMessageConversations' })
  }
}

export async function sendProviderMessage(patientProfileId: string, body: string) {
  try {
    if (!body.trim() || [...body.trim()].length > 4000) throw new AppError('VALIDATION_ERROR', { message: 'Enter a message between 1 and 4000 characters.', details: { fieldErrors: { body: 'INVALID' } } })
    const { error, status } = await supabase.from('messages').insert({
      patient_profile_id: patientProfileId,
      sender_kind: 'provider',
      body: body.trim(),
    })
    if (error) throw normalizeError(error, { operation: 'sendProviderMessage', status })
  } catch (error) {
    throw normalizeError(error, { operation: 'sendProviderMessage' })
  }
}

export async function markMessageThreadRead(patientProfileId: string, latestDisplayedAt: string) {
  try {
    const { error, status } = await supabase.from('message_thread_state')
      .update({ last_read_at: latestDisplayedAt })
      .eq('patient_profile_id', patientProfileId)
    if (error) throw normalizeError(error, { operation: 'markMessageThreadRead', status })
  } catch (error) {
    throw normalizeError(error, { operation: 'markMessageThreadRead' })
  }
}

export async function setMessageThreadStarred(patientProfileId: string, starred: boolean) {
  try {
    const { error, status } = await supabase.from('message_thread_state')
      .update({ starred })
      .eq('patient_profile_id', patientProfileId)
    if (error) throw normalizeError(error, { operation: 'setMessageThreadStarred', status })
  } catch (error) {
    throw normalizeError(error, { operation: 'setMessageThreadStarred' })
  }
}
