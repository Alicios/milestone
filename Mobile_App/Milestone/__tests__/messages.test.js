import { loadPatientConversations, loadPatientMessages, sendPatientMessage, markPatientMessagesRead } from '../lib/messages';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: jest.fn() } }));
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
