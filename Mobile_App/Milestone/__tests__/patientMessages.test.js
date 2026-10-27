import React from 'react';
import { AppState } from 'react-native';
import Renderer from 'react-test-renderer';
import usePatientMessages from '../lib/usePatientMessages';
import { loadPatientConversations, loadPatientMessages, markPatientMessagesRead, sendPatientMessage } from '../lib/messages';
import { supabase } from '../lib/supabase';

jest.mock('../lib/messages', () => ({ loadPatientConversations: jest.fn(), loadPatientMessages: jest.fn(), markPatientMessagesRead: jest.fn(), sendPatientMessage: jest.fn() }));
jest.mock('../lib/supabase', () => ({ supabase: { channel: jest.fn(), removeChannel: jest.fn() } }));
let api, renderer, background, inserted;
const conversation = { id: 'relationship', name: 'Provider', unread: 1, preview: 'Hello' };
const message = { id: 'message', sender_kind: 'provider', body: 'Hello', created_at: '2026-10-27T04:00:00Z' };
function Harness(props) { api = usePatientMessages(props); return null; }
const initial = { enabled: true, patientId: 'patient', visible: false };
async function mount(props = initial) { await Renderer.act(async () => { renderer = Renderer.create(<Harness {...props} />); }); }
async function update(props) { await Renderer.act(async () => renderer.update(<Harness {...props} />)); }
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  loadPatientConversations.mockResolvedValue([conversation]); loadPatientMessages.mockResolvedValue([message]);
  markPatientMessagesRead.mockResolvedValue(); sendPatientMessage.mockResolvedValue('reply');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, cb) => { background = cb; return { remove: jest.fn() }; });
  supabase.channel.mockImplementation(() => { const channel = { on: jest.fn((_, _filter, cb) => { inserted = cb; return channel; }), subscribe: jest.fn(() => channel) }; return channel; });
});
afterEach(async () => { await Renderer.act(async () => renderer?.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });
test('Home counts unread messages without marking them read; opening a thread reads only displayed history', async () => {
  await mount(); expect(api.unread).toBe(1); expect(markPatientMessagesRead).not.toHaveBeenCalled();
  await update({ ...initial, visible: true });
  await Renderer.act(async () => api.select('relationship'));
  expect(api.messages).toEqual([message]);
  expect(markPatientMessagesRead).toHaveBeenCalledWith('relationship', 'message');
});
test('refreshes realtime messages and reconciles after foreground return, without reading while backgrounded', async () => {
  await mount({ ...initial, visible: true });
  await Renderer.act(async () => api.select('relationship'));
  markPatientMessagesRead.mockClear(); loadPatientConversations.mockClear();
  await Renderer.act(async () => background('background'));
  await Renderer.act(async () => jest.advanceTimersByTime(16000));
  expect(markPatientMessagesRead).not.toHaveBeenCalled(); expect(loadPatientConversations).not.toHaveBeenCalled();
  await Renderer.act(async () => background('active'));
  expect(loadPatientConversations).toHaveBeenCalled();
  loadPatientMessages.mockResolvedValue([message, { ...message, id: 'second', body: 'Follow-up' }]);
  await Renderer.act(async () => inserted());
  expect(api.messages).toHaveLength(2);
});
test('prevents duplicate concurrent sends and preserves failure for the composer', async () => {
  await mount({ ...initial, visible: true }); await Renderer.act(async () => api.select('relationship'));
  let reject;
  sendPatientMessage.mockImplementation(() => new Promise((_, failure) => { reject = failure; }));
  let first;
  await Renderer.act(async () => { first = api.send('Draft'); });
  await Renderer.act(async () => expect(await api.send('Draft')).toBe(false));
  expect(sendPatientMessage).toHaveBeenCalledTimes(1);
  await Renderer.act(async () => { reject(new Error('offline')); expect(await first).toBe(false); });
  expect(api.error).toBe('offline'); expect(api.sending).toBe(false);
});
test('ignores late responses after locking or changing accounts', async () => {
  await mount();
  let resolve;
  loadPatientConversations.mockImplementation(() => new Promise(done => { resolve = done; }));
  let request;
  await Renderer.act(async () => { request = api.refresh(); });
  await update({ ...initial, enabled: false });
  await Renderer.act(async () => { resolve([{ ...conversation, name: 'Stale' }]); await request; });
  expect(api.conversations[0].name).toBe('Provider');
  loadPatientConversations.mockResolvedValue([]);
  await update({ ...initial, patientId: 'another-patient' });
  expect(api.conversations).toEqual([]); expect(api.messages).toEqual([]);
});
