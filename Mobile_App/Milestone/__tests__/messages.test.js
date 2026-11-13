import { loadPatientConversations, loadPatientMessages, sendPatientImage, sendPatientMessage, markPatientMessagesRead } from '../lib/messages';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: jest.fn(), auth: { getUser: jest.fn() }, storage: { from: jest.fn() } } }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
test('paginates persisted history beyond the API row limit', async () => {
  const range = jest.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null })
    .mockResolvedValueOnce({ data: [{ id: 500 }], error: null });
  supabase.rpc.mockReturnValue({ range });
  const messages = await loadPatientMessages('relationship');
  expect(messages).toHaveLength(501);
  expect(supabase.rpc).toHaveBeenCalledWith('get_my_messages', { p_patient_profile_id: 'relationship' });
  expect(range.mock.calls).toEqual([[0, 499], [500, 999]]);
});
test('shows real inbox summaries, empty conversations, and unread counts', async () => {
  supabase.rpc.mockReturnValue({ range: jest.fn(async () => ({ data: [{ patient_profile_id: 'relationship', provider_name: 'Provider', provider_professional_title: 'PT', provider_avatar_url: 'https://example.com/provider.jpg', unread_count: '2', last_body: null, last_message_at: null }] })) });
  expect(await loadPatientConversations()).toEqual([{ id: 'relationship', name: 'Provider', title: 'PT', avatarUrl: 'https://example.com/provider.jpg', unread: 2, preview: 'No messages yet', lastMessageAt: null }]);
});
test('sends a trimmed patient message, rejects empty/oversized text, and reports API failures', async () => {
  supabase.rpc.mockResolvedValue({ data: 'message-id', error: null });
  expect(await sendPatientMessage('relationship', '  Hello  ')).toBe('message-id');
  expect(supabase.rpc).toHaveBeenCalledWith('send_my_message', { p_patient_profile_id: 'relationship', p_body: 'Hello' });
  await expect(sendPatientMessage('relationship', ' \n ')).rejects.toThrow('between 1 and 4000');
  await expect(sendPatientMessage('relationship', 'x'.repeat(4001))).rejects.toThrow('between 1 and 4000');
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
  supabase.rpc.mockResolvedValue({ error: new Error('offline') });
  await expect(sendPatientMessage('relationship', 'Retry later')).rejects.toThrow('offline');
});
test('read cursor uses the displayed message ID instead of the device clock', async () => {
  supabase.rpc.mockResolvedValue({ error: null });
  await markPatientMessagesRead('relationship', 'displayed-message');
  expect(supabase.rpc).toHaveBeenCalledWith('read_my_message_thread', { p_patient_profile_id: 'relationship', p_latest_message_id: 'displayed-message' });
});

test('image send uploads before saving the message and keeps the selected image path', async () => {
  const order = [];
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'patient-user' } }, error: null });
  supabase.storage.from.mockReturnValue({ upload: jest.fn(async (path, bytes, options) => { order.push(['upload', path, bytes, options]); return { error: null }; }) });
  supabase.rpc.mockImplementation(async (name, args) => { order.push(['rpc', name, args]); return { data: 'message-id', error: null }; });
  const bytes = new ArrayBuffer(3);
  await sendPatientImage('relationship', { mimeType: 'image/jpeg', file: { arrayBuffer: async () => bytes } }, ' caption ');
  expect(order[0][0]).toBe('upload');
  expect(order[0][1]).toMatch(/^relationship\/patient-user\/[a-z0-9-]+\.jpg$/);
  expect(order[0][2]).toBe(bytes);
  expect(order[0][3]).toEqual({ contentType: 'image/jpeg', upsert: false });
  expect(order[1]).toEqual(['rpc', 'send_my_image_message', { p_patient_profile_id: 'relationship', p_body: 'caption', p_image_path: order[0][1] }]);
});
