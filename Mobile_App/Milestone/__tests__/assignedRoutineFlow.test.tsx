/**
 * @format
 */

import React from 'react';
import {Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type {ReactTestInstance} from 'react-test-renderer';
import App from '../App';

jest.mock('../lib/exerciseFeedback', () => ({ saveExerciseFeedback: jest.fn(async (_id, value) => ({ ...value, reportedAt: '2026-11-03T18:00:00Z' })) }));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const mockAudioPlayer = { isLoaded: true, currentTime: 0, play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(async () => {}) };
jest.mock('expo-audio', () => ({
  useAudioPlayer: jest.fn(() => mockAudioPlayer),
  useAudioPlayerStatus: jest.fn(() => ({ isLoaded: true, playing: false, didJustFinish: false, currentTime: 0, duration: 3 })),
  setAudioModeAsync: jest.fn(async () => {}),
}));

jest.mock('expo-sensors', () => ({
  Accelerometer: {
    isAvailableAsync: jest.fn(async () => false),
    getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn(),
  },
}));

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true, null]),
}));

jest.mock('../auth/PatientSession', () => ({
  PatientSessionProvider: ({children}: {children: React.ReactNode}) => children,
}));

// Routine regression tests run inside an already unlocked session.
jest.mock('../components/UnlockGate', () => ({
  __esModule: true,
  default: ({children}: {children: Function}) => children({unlocked: true, onLock: jest.fn(), profile: {id: 'patient-1', fullName: 'Frank Murgolo', preferredName: '', phone: '0000000000', email: 'frank@example.com'}}),
}));

let renderer: ReactTestRenderer.ReactTestRenderer;

function textOf(node: ReactTestInstance): string {
  return node.children
    .map(child => (typeof child === 'string' ? child : textOf(child)))
    .join('');
}

function hasText(value: string) {
  return renderer.root.findAllByType(Text).some(node => {
    if (textOf(node) !== value) return false;
    let ancestor: ReactTestInstance | null = node;
    while (ancestor) {
      if (ancestor.props['aria-hidden'] === true || ancestor.props.accessibilityElementsHidden === true) return false;
      ancestor = ancestor.parent;
    }
    return true;
  });
}

function button(label: string) {
  const match = renderer.root
    .findAll(
      node =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.onPress === 'function',
    )
    .find(
      node =>
        node.props.accessibilityLabel === label || textOf(node) === label,
    );
  if (!match) {
    throw new Error(`Button not found: ${label}`);
  }
  return match;
}

async function press(label: string) {
  if (label === 'Next exercise') {
    await choosePain(3);
    await ReactTestRenderer.act(() => button('Exercise felt good').props.onPress());
  }
  await ReactTestRenderer.act(async () => { await button(label).props.onPress(); });
}

async function advanceTime(milliseconds: number) {
  await ReactTestRenderer.act(() => jest.advanceTimersByTime(milliseconds));
}

function timerText() {
  return textOf(renderer.root.findByProps({testID: 'exercise-timer'}));
}

async function finishExercise(sets: number) {
  for (let set = 1; set <= sets; set += 1) {
    await press('Pause exercise');
    await press(set === sets ? 'Finish exercise' : 'Next set');
  }
}


let mockExercises: unknown[];
let mockCatalog: unknown[];
let mockAssignment: unknown;
let mockUpcoming: unknown[];
jest.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: {} }));
jest.mock('../lib/usePatientMessages', () => ({ __esModule: true, default: () => ({ conversations: [], messages: [], loading: false, error: '', unread: 0 }) }));
jest.mock('../lib/patientRoutine', () => ({ loadPatientRoutine: async () => ({
  routine: mockAssignment ? { name: 'Lower Body' } : null,
  exercises: mockAssignment ? require('../lib/assignedExercises').normalizeAssignedExercises(require('../lib/assignedExercises').parseExerciseList(mockExercises), mockCatalog, ['#8BC0BC']).map((exercise, index) => ({ ...exercise, assignmentExerciseId: `snapshot-${index}` })) : [],
  upcoming: mockUpcoming,
}), exercisesForAssignment: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockAssignment = {id: 'assignment', routine_id: 'routine', scheduled_date: '2026-10-26', status: 'scheduled'};
  mockUpcoming = [];
  mockExercises = ['Leg Stretch', 'Calf Stretch'];
  mockCatalog = [{id: 'leg', name: 'Leg Stretch', desc: 'Stretch gently'}, {id: 'calf', name: 'Calf Stretch', desc: 'Stretch your calf'}];
});
afterEach(async () => {
  if (renderer) await ReactTestRenderer.act(() => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});
async function choosePain(score: number) {
  const slider = () => renderer.root.findByProps({testID: 'pain-slider'});
  const act = ReactTestRenderer.act;
  while (slider().props.accessibilityValue.now !== score) {
    const current = slider().props.accessibilityValue.now;
    await act(async () => slider().props.onAccessibilityAction({nativeEvent: {actionName: current == null || current < score ? 'increment' : 'decrement'}}));
  }
}

async function mount() {
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
}
test('Frank can load, start and finish both legacy named exercises', async () => {
  await mount();
  expect(hasText('Welcome back, Frank.')).toBe(true);
  await press('Routines');
  expect(hasText('Leg Stretch')).toBe(true);
  expect(hasText('Calf Stretch')).toBe(true);
  await press('Start routine');
  await press('Start exercise');
  expect(timerText()).toBe('00.00.00');
  await advanceTime(1000);
  expect(timerText()).toBe('00.01.00');
  await finishExercise(1);
  expect(hasText('How did it feel?')).toBe(true);
  await press('Next exercise');
  await press('Start exercise');
  await finishExercise(1);
  await press('Next exercise');
  expect(hasText('ROUTINE COMPLETE!')).toBe(true);
});

test.each(['ios', 'android'] as const)('keeps %s exercise feedback accessible while typing and preserves the response', async platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  const callbacks: Record<string, Function[]> = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, callback) => {
    (callbacks[event] ||= []).push(callback);
    return {remove: jest.fn()};
  });
  const scrollToInput = jest.spyOn(ScrollView.prototype, 'scrollResponderScrollNativeHandleToKeyboard').mockImplementation(() => {});
  await mount();
  await press('Start routine');
  await press('Start exercise');
  await finishExercise(1);
  await choosePain(3);
  await press('Exercise felt difficult');
  const input = () => renderer.root.findByType(TextInput);
  await ReactTestRenderer.act(() => {
    input().props.onFocus();
    input().props.onChangeText('My knee felt sore.');
  });
  const avoider = renderer.root.findByType(KeyboardAvoidingView);
  const layout = async (height: number) => {
    await ReactTestRenderer.act(async () => avoider.instance._onLayout({persist: jest.fn(), nativeEvent: {layout: {x: 0, y: 0, width: 390, height}}}));
  };
  const keyboardEvent = async (visible: boolean, screenY = 360) => {
    const event = {endCoordinates: {screenY, height: 844 - screenY}};
    await ReactTestRenderer.act(async () => {
      for (const phase of ['Will', 'Did']) {
        (callbacks[`keyboard${phase}${visible ? 'Show' : 'Hide'}`] || []).forEach(callback => callback(event));
      }
    });
  };
  await layout(844);
  scrollToInput.mockClear();
  await keyboardEvent(true);
  expect(avoider.instance.state.bottom).toBe(484);
  expect(scrollToInput).toHaveBeenCalledWith(expect.anything(), 12, true);
  expect(hasText('Home')).toBe(false);
  expect(input().props.value).toBe('My knee felt sore.');
  // A short landscape window and Android adjustResize must not add duplicate insets.
  await layout(390);
  await keyboardEvent(true, 180);
  expect(avoider.instance.state.bottom).toBe(210);
  if (platform === 'android') {
    await layout(180);
    expect(avoider.instance.state.bottom).toBe(0);
  }
  await keyboardEvent(false);
  expect(avoider.instance.state.bottom).toBe(0);
  expect(hasText('Home')).toBe(true);
  expect(input().props.value).toBe('My knee felt sore.');
  await ReactTestRenderer.act(async () => button('Next exercise').props.onPress());
  expect(require('../lib/exerciseFeedback').saveExerciseFeedback).toHaveBeenCalledWith(
    'snapshot-0', expect.objectContaining({explanation: 'My knee felt sore.', feeling: 'difficult', painScore: 3}),
  );
});
test('prescribed duration_seconds runs a countdown and preserves sets', async () => {
  mockExercises = [{exercise_id: 'leg', name: 'Leg Stretch', sets: 2, reps: 3, duration_seconds: 30}];
  await mount();
  await press('Start routine');
  await press('Start exercise');
  expect(timerText()).toBe('00.30.00');
  await advanceTime(1000);
  expect(timerText()).toBe('00.29.00');
  await press('Pause exercise');
  await press('Next set');
  expect(timerText()).toBe('00.30.00');
});
test('a missing catalog record keeps the assigned name visible', async () => {
  mockCatalog = [];
  await mount();
  await press('Routines');
  expect(hasText('Leg Stretch')).toBe(true);
  expect(hasText('Calf Stretch')).toBe(true);
});
test('no assignment remains an empty day instead of a missing routine_id error', async () => {
  mockAssignment = null;
  await mount();
  expect(hasText('No routines today')).toBe(true);
});

test.each([true, false])('upcoming routines show prescribed exercises and stats when today has a routine: %s', async hasToday => {
  if (!hasToday) mockAssignment = null;
  mockUpcoming = [{id: 'future', name: 'Next mobility routine', scheduledDate: '2026-11-10', status: 'scheduled'}];
  const loadExercises = require('../lib/patientRoutine').exercisesForAssignment;
  loadExercises.mockResolvedValue(require('../lib/assignedExercises').normalizeAssignedExercises([
    {assignmentExerciseId: 'future-reps', name: 'Ankle circles', sets: 3, reps: 12, notes: 'Circle each ankle slowly.'},
    {assignmentExerciseId: 'future-timer', name: 'Standing stretch', sets: 2, duration_seconds: 30},
  ], [], ['#8BC0BC']));
  await mount();
  await press('Routines');
  const label = `Next mobility routine, ${new Date('2026-11-10T00:00:00').toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'})} information`;
  expect(button(label).props.accessibilityState.expanded).toBe(false);
  expect(loadExercises).not.toHaveBeenCalled();
  await press(label);
  expect(button(label).props.accessibilityState.expanded).toBe(true);
  expect(loadExercises).toHaveBeenCalledWith('future', expect.any(Array));
  expect(hasText('Ankle circles')).toBe(true);
  expect(hasText('3 Sets')).toBe(true);
  expect(hasText('12 Reps')).toBe(true);
  expect(hasText('2 Sets')).toBe(true);
  expect(hasText('30 Seconds')).toBe(true);
  await press('Ankle circles information');
  expect(hasText('Circle each ankle slowly.')).toBe(true);
  await press(label);
  expect(hasText('Ankle circles')).toBe(false);
  await press(label);
  expect(hasText('Ankle circles')).toBe(true);
  expect(loadExercises).toHaveBeenCalledTimes(1);
});
