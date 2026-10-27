import { isSupabaseConfigured, supabase } from './supabase';

async function rpc(name, args) {
  if (!isSupabaseConfigured) throw new Error('Messaging is unavailable. Configure Supabase and restart the app.');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

async function rows(name, args) {
  if (!isSupabaseConfigured) throw new Error('Messaging is unavailable. Configure Supabase and restart the app.');
  const result = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.rpc(name, args).range(offset, offset + 499);
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < 500) return result;
  }
}

export async function loadPatientConversations() {
  return (await rows('get_my_message_inbox')).map(row => ({
    id: row.patient_profile_id, name: row.provider_name, title: row.provider_professional_title,
    avatarUrl: row.provider_avatar_url || null,
    preview: row.last_body || 'No messages yet', lastMessageAt: row.last_message_at,
    unread: Number(row.unread_count),
  }));
}

export async function loadPatientMessages(profileId) {
  return rows('get_my_messages', { p_patient_profile_id: profileId });
}

export async function sendPatientMessage(profileId, body) {
  const text = body.trim();
  if (!text || [...text].length > 4000) throw new Error('Enter a message between 1 and 4000 characters.');
  return rpc('send_my_message', { p_patient_profile_id: profileId, p_body: text });
}

export function markPatientMessagesRead(profileId, latestMessageId) {
  return rpc('read_my_message_thread', { p_patient_profile_id: profileId, p_latest_message_id: latestMessageId });
}
