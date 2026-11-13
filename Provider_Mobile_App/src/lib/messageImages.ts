import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { supabase } from './supabase';

export type PickedMessageImage = ImagePicker.ImagePickerAsset;

export async function pickMessageImage(): Promise<PickedMessageImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  const size = asset?.fileSize ?? asset?.file?.size ?? (asset?.uri ? new File(asset.uri).size : 0);
  if (!asset?.uri || !size || size > 10 * 1024 * 1024 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType ?? '')) {
    throw new Error('Choose a JPEG, PNG, or WebP image under 10 MB.');
  }
  return asset;
}

export async function sendProviderImage(profileId: string, asset: PickedMessageImage, body: string): Promise<void> {
  if ([...body.trim()].length > 4000) throw new Error('Message is too long.');
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) throw authError ?? new Error('Sign in to send an image.');
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[asset.mimeType ?? ''];
  if (!extension) throw new Error('Unsupported image type.');
  const path = `${profileId}/${data.user.id}/${randomUUID()}.${extension}`;
  const bytes = asset.file ? await asset.file.arrayBuffer() : await new File(asset.uri).arrayBuffer();
  const { error: uploadError } = await supabase.storage.from('message-images').upload(path, bytes, { contentType: asset.mimeType, upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await supabase.from('messages').insert({ patient_profile_id: profileId, sender_kind: 'provider', body: body.trim(), image_path: path });
  if (error) throw error;
}

