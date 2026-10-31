import React, { useState } from 'react';
import { Dimensions, StyleSheet, TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import MessagesScreen from '../components/MessagesScreen';
import useAdaptiveLayout from '../components/useAdaptiveLayout';

let mockInsets = { top: 0, left: 0, bottom: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets }));

let windowSize;
let renderer;
const conversations = [
  { id: 'a', name: 'Alex Provider', preview: 'Keep moving.', unread: 1 },
  { id: 'b', name: 'Blair Provider', preview: 'See you soon.', unread: 0 },
];
const send = jest.fn(async () => true);
function Harness() {
  const [selectedId, select] = useState(null);
  return <MessagesScreen messaging={{ conversations, selected: conversations.find(row => row.id === selectedId),
    messages: [{ id: 'message', body: 'Keep moving.', sender_kind: 'provider' }],
    select, send, loading: false, sending: false, error: '', refresh: jest.fn() }} />;
}
function button(label) {
  return renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
}
async function press(label) { await act(async () => button(label).props.onPress()); }
async function resize(width, height, fontScale = 1) {
  windowSize = { width, height, fontScale, scale: 1 };
  await act(async () => Dimensions.set({ window: windowSize }));
}
function paneStyle(id) { return StyleSheet.flatten(renderer.root.findByProps({ testID: id }).props.style); }
function input() { return renderer.root.findByType(TextInput); }

beforeEach(() => {
  windowSize = { width: 390, height: 844, fontScale: 1, scale: 1 };
  mockInsets = { top: 0, left: 0, bottom: 0, right: 0 };
  Dimensions.set({ window: windowSize });
  send.mockClear();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  jest.restoreAllMocks();
});

test('keeps the selected conversation and each provider draft through fold/unfold and rotation', async () => {
  await act(async () => { renderer = ReactTestRenderer.create(<Harness />); });
  expect(paneStyle('conversation-detail').display).toBe('none');
  await press('Conversation with Alex Provider, 1 unread');
  await act(async () => input().props.onChangeText('Draft for Alex'));
  expect(paneStyle('conversation-list').display).toBe('none');

  await resize(1024, 768);
  expect(paneStyle('messages-panes').flexDirection).toBe('row');
  expect(paneStyle('conversation-list').display).not.toBe('none');
  expect(input().props.value).toBe('Draft for Alex');
  await press('Conversation with Blair Provider');
  await act(async () => input().props.onChangeText('Draft for Blair'));
  await resize(360, 740);
  expect(paneStyle('conversation-list').display).toBe('none');
  expect(input().props.value).toBe('Draft for Blair');
  await press('Back to conversations');
  await press('Conversation with Alex Provider, 1 unread');
  expect(input().props.value).toBe('Draft for Alex');
  await resize(1280, 800);
  await press('Send message');
  expect(send).toHaveBeenCalledWith('Draft for Alex');
  expect(input().props.value).toBe('');
});

test('keeps provider selection usable while resizing and cancelling compose', async () => {
  await act(async () => { renderer = ReactTestRenderer.create(<Harness />); });
  await press('Compose message');
  await resize(900, 700);
  await press('Message Blair Provider');
  expect(input().props.accessibilityLabel).toBe('Message to provider');
  await press('Compose message');
  await resize(320, 568);
  await press('Cancel new message');
  expect(paneStyle('conversation-detail').display).toBe('none');
  expect(paneStyle('conversation-list').display).not.toBe('none');
});

test('uses the usable window and large text setting rather than the physical device size', async () => {
  let layout;
  function Probe() { layout = useAdaptiveLayout(); return null; }
  windowSize = { width: 900, height: 600, fontScale: 1, scale: 1 };
  Dimensions.set({ window: windowSize });
  await act(async () => { renderer = ReactTestRenderer.create(<Probe />); });
  expect(layout.isWide).toBe(true);
  mockInsets = { top: 30, left: 40, bottom: 20, right: 40 };
  await act(async () => { Dimensions.set({ window: windowSize }); renderer.update(<Probe />); });
  expect(layout.width).toBe(820);
  expect(layout.isWide).toBe(false);
  windowSize = { width: 1200, height: 480, fontScale: 2, scale: 1 };
  await act(async () => Dimensions.set({ window: windowSize }));
  expect(layout.isWide).toBe(false);
  expect(layout.isShort).toBe(true);
});
