/**
 * @format
 */

import React from 'react';
import {Image, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type {ReactTestInstance} from 'react-test-renderer';
import App from '../App';
import {supabase} from '../lib/supabase';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';

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
  default: ({children}: {children: Function}) => children({unlocked: true, onLock: jest.fn(), profile: {fullName: 'Frank Murgolo', preferredName: '', phone: '0000000000', email: 'frank@example.com'}}),
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
  await ReactTestRenderer.act(() => button(label).props.onPress());
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
jest.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: {} }));
jest.mock('../lib/usePatientMessages', () => ({ __esModule: true, default: () => ({ conversations: [], messages: [], loading: false, error: '', unread: 0 }) }));
jest.mock('../lib/patientRoutine', () => ({ loadPatientRoutine: async () => ({
  routine: mockAssignment ? { name: 'Lower Body' } : null,
  exercises: mockAssignment ? require('../lib/assignedExercises').normalizeAssignedExercises(require('../lib/assignedExercises').parseExerciseList(mockExercises), mockCatalog, ['#8BC0BC']) : [],
}) }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockAssignment = {id: 'assignment', routine_id: 'routine', scheduled_date: '2026-10-26', status: 'scheduled'};
  mockExercises = ['Leg Stretch', 'Calf Stretch'];
  mockCatalog = [{id: 'leg', name: 'Leg Stretch', desc: 'Stretch gently'}, {id: 'calf', name: 'Calf Stretch', desc: 'Stretch your calf'}];
});
afterEach(async () => {
  if (renderer) await ReactTestRenderer.act(() => renderer.unmount());
  jest.useRealTimers();
});
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
  expect(hasText('How did that feel?')).toBe(true);
  await press('Next exercise');
  await press('Start exercise');
  await finishExercise(1);
  await press('Next exercise');
  expect(hasText('ROUTINE COMPLETE!')).toBe(true);
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
