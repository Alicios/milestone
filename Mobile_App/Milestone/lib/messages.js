import { isSupabaseConfigured, supabase } from './supabase';
import * as ImagePicker from 'expo-image-picker';
import { File as ExpoFile } from 'expo-file-system';

const signedImages = new Map();
async function signedImage(path) {
  const cached = signedImages.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const { data } = await supabase.storage.from('message-images').createSignedUrl(path, 300);
  if (!data?.signedUrl) return null;
  signedImages.set(path, { url: data.signedUrl, expiresAt: Date.now() + 240000 });
  return data.signedUrl;
}

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
  const messages = await rows('get_my_messages', { p_patient_profile_id: profileId });
  return Promise.all(messages.map(async message => {
    if (!message.image_path) return message;
    return { ...message, image_url: await signedImage(message.image_path) };
  }));
}

export async function choosePatientMessageImage() {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  const type = asset?.mimeType;
  const size = asset?.fileSize ?? asset?.file?.size ?? (asset?.uri ? new ExpoFile(asset.uri).size : 0);
  if (!asset?.uri || !['image/jpeg', 'image/png', 'image/webp'].includes(type) || !size || size > 10 * 1024 * 1024) {
    throw new Error('Choose a JPEG, PNG, or WebP image under 10 MB.');
  }
  return asset;
}

export async function sendPatientImage(profileId, asset, body) {
  if ([...body.trim()].length > 4000) throw new Error('Message is too long.');
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) throw authError || new Error('Sign in to send an image.');
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[asset.mimeType];
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const path = `${profileId}/${userData.user.id}/${uniqueName}.${extension}`;
  const bytes = asset.file ? await asset.file.arrayBuffer() : await new ExpoFile(asset.uri).arrayBuffer();
  const { error: uploadError } = await supabase.storage.from('message-images').upload(path, bytes, { contentType: asset.mimeType, upsert: false });
  if (uploadError) throw uploadError;
  return rpc('send_my_image_message', { p_patient_profile_id: profileId, p_body: body.trim(), p_image_path: path });
}

export async function sendPatientMessage(profileId, body) {
  const text = body.trim();
  if (!text || [...text].length > 4000) throw new Error('Enter a message between 1 and 4000 characters.');
  return rpc('send_my_message', { p_patient_profile_id: profileId, p_body: text });
}

export function markPatientMessagesRead(profileId, latestMessageId) {
  return rpc('read_my_message_thread', { p_patient_profile_id: profileId, p_latest_message_id: latestMessageId });
}
