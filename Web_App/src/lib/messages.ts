import { AppError, normalizeError } from './errors'
import { supabase } from './supabase'

export type Message = {
  id: string
  text: string
  from: 'patient' | 'provider'
  createdAt: string
  imagePath: string | null
  imageUrl: string | null
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
  image_path: string | null
}

const imageBucket = () => supabase.storage.from('message-images')
const imageTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const signedImages = new Map<string, { url: string; expiresAt: number }>()

export async function checkMessageImageSupport(): Promise<boolean> {
  const { error, status } = await supabase.from('messages').select('image_path').limit(0)
  if (!error) return true
  if (error.code === '42703' || error.code === 'PGRST204') return false
  throw normalizeError(error, { operation: 'checkMessageImageSupport', status })
}

async function signedImage(path: string): Promise<string | null> {
  const cached = signedImages.get(path)
  if (cached && cached.expiresAt > Date.now()) return cached.url
  const { data } = await imageBucket().createSignedUrl(path, 300)
  if (!data?.signedUrl) return null
  signedImages.set(path, { url: data.signedUrl, expiresAt: Date.now() + 240000 })
  return data.signedUrl
}

export async function sendProviderImage(patientProfileId: string, file: File, body: string) {
  const extension = imageTypes[file.type]
  if (!extension || file.size > 10 * 1024 * 1024 || file.size === 0) throw new Error('Choose a JPEG, PNG, or WebP image under 10 MB.')
  if ([...body.trim()].length > 4000) throw new Error('Message is too long.')
  if (!await checkMessageImageSupport()) throw new AppError('SERVICE_UNAVAILABLE', { message: 'Image attachments are waiting for the database update. Text messages are available.' })
  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData.user) throw authError ?? new Error('Sign in to send an image.')
  const path = `${patientProfileId}/${userData.user.id}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await imageBucket().upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw uploadError
  const { error } = await supabase.from('messages').insert({ patient_profile_id: patientProfileId, sender_kind: 'provider', body: body.trim(), image_path: path })
  if (error) throw error
}

export async function downloadMessageImage(path: string) {
  const { data, error } = await imageBucket().download(path)
  if (error) throw error
  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = `message-image.${path.split('.').at(-1) ?? 'jpg'}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
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
    let supportsImages = true
    for (let offset = 0; ; offset += 500) {
      let response: { data: unknown[] | null; error: { code?: string } | null; status: number } = await supabase.from('messages')
        .select(supportsImages ? 'id, sender_kind, body, created_at, image_path' : 'id, sender_kind, body, created_at')
        .eq('patient_profile_id', patientProfileId)
        .order('created_at', { ascending: true }).order('id', { ascending: true })
        .range(offset, offset + 499)
      if (response.error?.code === '42703' && supportsImages) {
        supportsImages = false
        response = await supabase.from('messages')
          .select('id, sender_kind, body, created_at')
          .eq('patient_profile_id', patientProfileId)
          .order('created_at', { ascending: true }).order('id', { ascending: true })
          .range(offset, offset + 499)
      }
      if (response.error) throw normalizeError(response.error, { operation: 'loadMessageHistory', status: response.status })
      rows.push(...((response.data ?? []) as MessageRow[]))
      if (!response.data || response.data.length < 500) break
    }
    return await Promise.all(rows.map(async (row) => {
      const imageUrl = row.image_path ? await signedImage(row.image_path) : null
      return { id: row.id, text: row.body, from: row.sender_kind, createdAt: row.created_at, imagePath: row.image_path ?? null, imageUrl }
    }))
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
