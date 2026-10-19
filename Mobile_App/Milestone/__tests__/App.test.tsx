/**
 * @format
 */

import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type {ReactTestInstance} from 'react-test-renderer';
import App from '../App';
import { useAudioPlayerStatus } from 'expo-audio';
import { Accelerometer } from 'expo-sensors';

const mockAudioPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(async () => {}) };
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
  return renderer.root.findAllByType(Text).some(node => textOf(node) === value);
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

beforeEach(async () => {
  jest.clearAllMocks();
  (Accelerometer.isAvailableAsync as jest.Mock).mockResolvedValue(false);
  (useAudioPlayerStatus as jest.Mock).mockReturnValue({ isLoaded: true, playing: false, didJustFinish: false, currentTime: 0, duration: 3 });
  jest.useFakeTimers();
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
});

test('reveals the hidden selector only through the three-second Home hold', async () => {
  await press('Messages');
  expect(hasText('LeTeam')).toBe(false);
  const home = button('Home');
  expect(home.props.delayLongPress).toBe(3000);
  await ReactTestRenderer.act(() => home.props.onPressIn());
  await ReactTestRenderer.act(() => home.props.onLongPress());
  expect(hasText('LeTeam')).toBe(true);
  await ReactTestRenderer.act(() => home.props.onPress());
  expect(hasText("You're all caught up")).toBe(true);
  expect(button('Select The King').props.accessibilityState.selected).toBe(true);
  await press('Select Number 76');
  expect(button('Select Number 76').props.accessibilityState.selected).toBe(true);
  await press('Flip the LeBron image');
  expect(button('Select The King').props.accessibilityState.selected).toBe(true);
  await press('Play the easter egg sound');
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1);
  (useAudioPlayerStatus as jest.Mock).mockReturnValue({ isLoaded: true, playing: true, duration: 3, currentTime: 1 });
  await ReactTestRenderer.act(() => renderer.update(<App />));
  await press('Pause the easter egg sound');
  expect(mockAudioPlayer.pause).toHaveBeenCalledTimes(1);
  (useAudioPlayerStatus as jest.Mock).mockReturnValue({ isLoaded: true, playing: false, didJustFinish: true, duration: 3, currentTime: 3 });
  await ReactTestRenderer.act(() => renderer.update(<App />));
  await press('Play the easter egg sound');
  expect(mockAudioPlayer.seekTo).toHaveBeenCalledWith(0);
  await press('Close hidden selector');
  expect(mockAudioPlayer.pause).toHaveBeenCalled();
  expect(hasText('LeTeam')).toBe(false);
  await ReactTestRenderer.act(() => button('Home').props.onPressIn());
  await press('Home');
  expect(hasText('Welcome back, Frank.')).toBe(true);
});

test('opening the selector pauses the exercise without losing the current timer', async () => {
  await press('Start routine');
  await advanceTime(1200);
  const saved = timerText();
  await ReactTestRenderer.act(() => button('Home').props.onLongPress());
  await advanceTime(2000);
  expect(timerText()).toBe(saved);
  await press('Close hidden selector');
  expect(button('Resume exercise')).toBeDefined();
  await press('Resume exercise');
  await advanceTime(100);
  expect(timerText()).not.toBe(saved);
});

test('both image choices retain the same active accelerometer subscription', async () => {
  const remove = jest.fn();
  (Accelerometer.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (Accelerometer.addListener as jest.Mock).mockReturnValue({remove});
  await ReactTestRenderer.act(async () => button('Home').props.onLongPress());
  expect(Accelerometer.addListener).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByProps({testID: 'easter-egg-image-tilt'})).toBeDefined();
  await press('Select Number 76');
  await press('Flip the LeBron image');
  expect(Accelerometer.addListener).toHaveBeenCalledTimes(1);
  expect(remove).not.toHaveBeenCalled();
  await press('Close hidden selector');
  expect(remove).toHaveBeenCalledTimes(1);
});

afterEach(async () => {
  await ReactTestRenderer.act(() => renderer.unmount());
  jest.useRealTimers();
});

test('opens Home with the daily overview and navigates to routines and messages', async () => {
  expect(hasText('Welcome back, Frank.')).toBe(true);
  expect(hasText('0 of 4 exercises complete')).toBe(true);
  expect(hasText('Not started')).toBe(true);
  expect(hasText('7 min')).toBe(true);
  expect(hasText('No new messages')).toBe(true);
  expect(button('Home').props.accessibilityState.selected).toBe(true);

  await press('View routine');
  expect(hasText('Push Ups')).toBe(true);
  expect(button('Routines').props.accessibilityState.selected).toBe(true);

  await press('Messages');
  expect(hasText("You're all caught up")).toBe(true);
  await press('Home');
  await press('View messages');
  expect(button('Messages').props.accessibilityState.selected).toBe(true);
  await press('Home');
  expect(hasText('Not started')).toBe(true);
});

test('pauses between tabs and resumes the same exercise, set, and timer', async () => {
  await press('Start routine');
  await advanceTime(1230);
  await press('Pause exercise');
  await press('Next set');
  await advanceTime(550);
  const savedTime = timerText();

  await press('Home');
  expect(hasText('In progress')).toBe(true);
  await advanceTime(2000);
  await press('Messages');
  await press('Resume routine');
  expect(hasText('Set 2 of 3')).toBe(true);
  expect(timerText()).toBe(savedTime);

  await press('Routines');
  await advanceTime(2000);
  await press('Continue routine');
  expect(hasText('Set 2 of 3')).toBe(true);
  expect(timerText()).toBe(savedTime);
  await advanceTime(100);
  expect(timerText()).not.toBe(savedTime);
});

test('preserves exercise review and counts a finished exercise only once', async () => {
  await press('Start routine');
  await finishExercise(3);
  await press('Exercise felt good');
  await press('Home');
  expect(hasText('1 of 4 exercises complete')).toBe(true);
  expect(hasText('25% complete')).toBe(true);
  const progress = renderer.root.findByProps({
    accessibilityRole: 'progressbar',
  });
  expect(progress.props).toEqual(
    expect.objectContaining({
      'aria-valuemin': 0,
      'aria-valuemax': 4,
      'aria-valuenow': 1,
      'aria-valuetext': '25% complete',
    }),
  );

  await press('Routines');
  await press('Continue routine');
  expect(hasText('You finished Push Ups')).toBe(true);
  expect(button('Exercise felt good').props.accessibilityState.selected).toBe(
    true,
  );
  await press('Home');
  await press('Resume routine');
  expect(hasText('You finished Push Ups')).toBe(true);
  await press('Next exercise');
  await press('Continue routine');
  expect(hasText('Sit Ups')).toBe(true);
  expect(hasText('Set 1 of 3')).toBe(true);
  await press('Home');
  expect(hasText('1 of 4 exercises complete')).toBe(true);
});

test('keeps completion and the final review until an explicit restart', async () => {
  await press('Start routine');
  for (const sets of [3, 3, 1, 1]) {
    await finishExercise(sets);
    await press('Next exercise');
    if (!hasText('ROUTINE COMPLETE!')) {
      await press('Continue routine');
    }
  }
  await press('Routine felt good');
  await press('Return home');
  expect(hasText('Complete')).toBe(true);
  expect(hasText('4 of 4 exercises complete')).toBe(true);
  expect(hasText('100% complete')).toBe(true);

  await press('View summary');
  expect(hasText('ROUTINE COMPLETE!')).toBe(true);
  expect(button('Routine felt good').props.accessibilityState.selected).toBe(
    true,
  );
  await press('Messages');
  await press('Home');
  await press('View routine');
  await press('View routine summary');
  expect(hasText('ROUTINE COMPLETE!')).toBe(true);
  await press('Home');
  await press('Start routine again');
  expect(hasText('Set 1 of 3')).toBe(true);
  expect(timerText()).toBe('00.00.00');
  await press('Home');
  expect(hasText('0 of 4 exercises complete')).toBe(true);
  expect(hasText('In progress')).toBe(true);
});

test('does not double-count repeated finish taps', async () => {
  await press('Start routine');
  for (let set = 1; set < 3; set += 1) {
    await press('Pause exercise');
    await press('Next set');
  }
  await press('Pause exercise');
  const finish = button('Finish exercise').props.onPress;
  await ReactTestRenderer.act(() => {
    finish();
    finish();
  });
  await press('Home');
  expect(hasText('1 of 4 exercises complete')).toBe(true);
});

test('resumes an elapsed countdown without making the timer negative', async () => {
  await press('Start routine');
  for (let exercise = 0; exercise < 2; exercise += 1) {
    await finishExercise(3);
    await press('Next exercise');
    await press('Continue routine');
  }
  await advanceTime(30000);
  expect(timerText()).toBe('00.00.00');
  await press('Home');
  await press('Resume routine');
  await advanceTime(1000);
  expect(timerText()).toBe('00.00.00');
  expect(button('Finish exercise')).toBeDefined();
});

test('resets the sample session on a fresh mount', async () => {
  await press('Start routine');
  await finishExercise(3);
  await ReactTestRenderer.act(() => renderer.unmount());
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(hasText('Not started')).toBe(true);
  expect(hasText('0 of 4 exercises complete')).toBe(true);
});
