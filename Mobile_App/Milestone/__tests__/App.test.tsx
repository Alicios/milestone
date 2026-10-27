/**
 * @format
 */

import React from 'react';
import {Image, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type {ReactTestInstance} from 'react-test-renderer';
import App from '../App';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';

// UI regressions use a saved assignment fixture rather than a live backend.
jest.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: {} }));
jest.mock('../lib/usePatientMessages', () => ({ __esModule: true, default: () => ({ conversations: [], messages: [], loading: false, error: '', unread: 0 }) }));
jest.mock('../lib/patientRoutine', () => ({ loadPatientRoutine: async () => ({ routine: { name: 'Daily routine' }, exercises: require('../lib/assignedExercises').normalizeAssignedExercises([
  {name: 'Push Ups', sets: 3, reps: 5, notes: 'A simple upper-body exercise that strengthens your chest, shoulders, and arms. Keep your body straight and move at a comfortable pace.'},
  {name: 'Sit Ups', sets: 3, reps: 5, notes: 'A core-strengthening exercise that works your abdominal muscles. Move slowly and avoid pulling on your neck.'},
  {name: 'Quad Stretch', sets: 1, duration_seconds: 30, notes: 'A lower-body stretch that helps improve flexibility in the front of your thigh.'},
  {name: 'Leg Stretch', sets: 1, duration_seconds: 30, notes: 'A gentle stretch for the legs that helps improve mobility and flexibility.'}
], [], ['#8BC0BC']) }) }));

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

const exerciseNames = ['Push Ups', 'Sit Ups', 'Quad Stretch', 'Leg Stretch'];
const exerciseOverviews = [
  'A simple upper-body exercise that strengthens your chest, shoulders, and arms. Keep your body straight and move at a comfortable pace.',
  'A core-strengthening exercise that works your abdominal muscles. Move slowly and avoid pulling on your neck.',
  'A lower-body stretch that helps improve flexibility in the front of your thigh.',
  'A gentle stretch for the legs that helps improve mobility and flexibility.',
];

function expectIntroduction(index: number) {
  expect(hasText('Up next')).toBe(true);
  expect(hasText(`Exercise ${index + 1} of 4`)).toBe(true);
  expect(button('Start exercise')).toBeDefined();
  expect(renderer.root.findAllByProps({testID: 'exercise-timer'})).toHaveLength(0);
  exerciseOverviews.forEach((overview, overviewIndex) => {
    expect(hasText(overview)).toBe(overviewIndex === index);
  });

  if (index < exerciseNames.length - 1) {
    expect(hasText('Coming up')).toBe(true);
    const upcoming = renderer.root.findByProps({testID: 'upcoming-exercises'});
    const upcomingNames = upcoming.findAllByType(Text)
      .map(textOf).filter(value => exerciseNames.includes(value));
    expect(upcomingNames).toEqual(exerciseNames.slice(index + 1));
    const actions = upcoming.findAll(node => node.props.accessibilityRole === 'button');
    expect(actions.every(node => node.props.accessibilityLabel?.endsWith(' information'))).toBe(true);
  } else {
    expect(hasText('Coming up')).toBe(false);
    expect(renderer.root.findAllByProps({testID: 'upcoming-exercises'})).toHaveLength(0);
  }
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockAudioPlayer.isLoaded = true;
  mockAudioPlayer.currentTime = 0;
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
  (setAudioModeAsync as jest.Mock).mockResolvedValue(undefined);
  (Accelerometer.isAvailableAsync as jest.Mock).mockResolvedValue(false);
  (useAudioPlayerStatus as jest.Mock).mockReturnValue({ isLoaded: true, playing: false, didJustFinish: false, currentTime: 0, duration: 3 });
  jest.useFakeTimers();
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
});

test('reveals the hidden selector only through the three-second Home hold', async () => {
  await press('Messages');
  expect(hasText('LeTeam')).toBe(false);
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
  const home = button('Home');
  expect(home.props.delayLongPress).toBe(3000);
  await ReactTestRenderer.act(() => home.props.onPressIn());
  await ReactTestRenderer.act(async () => home.props.onLongPress());
  expect(hasText('LeTeam')).toBe(true);
  expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  await ReactTestRenderer.act(() => home.props.onPress());
  expect(hasText("No care team conversations yet. Your linked providers will appear here.")).toBe(true);
  expect(renderer.root.findAllByType(Image)).toHaveLength(1);
  expect(renderer.root.findByProps({accessibilityLabel: 'LeBron James in a Los Angeles Lakers uniform.'})).toBeDefined();
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1);
  expect(useAudioPlayer).toHaveBeenLastCalledWith(require('../assets/easter-egg/lebroooon-james.mp3'));
  await press('Flip the LeBron image');
  expect(renderer.root.findByProps({accessibilityLabel: 'LeBron James, number 76.'})).toBeDefined();
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(2);
  expect(useAudioPlayer).toHaveBeenLastCalledWith(require('../assets/easter-egg/bang-basketball_Y4765Ub.mp3'));
  await press('Flip the LeBron image');
  expect(renderer.root.findByProps({accessibilityLabel: 'LeBron James in a Los Angeles Lakers uniform.'})).toBeDefined();
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(3);
  await press('Play the easter egg sound');
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(4);
  (useAudioPlayerStatus as jest.Mock).mockReturnValue({ isLoaded: true, playing: true, duration: 3, currentTime: 1 });
  await ReactTestRenderer.act(() => renderer.update(<App />));
  await press('Pause the easter egg sound');
  expect(mockAudioPlayer.pause).toHaveBeenCalledTimes(3);
  (useAudioPlayerStatus as jest.Mock).mockReturnValue({ isLoaded: true, playing: false, didJustFinish: true, duration: 3, currentTime: 3 });
  await ReactTestRenderer.act(() => renderer.update(<App />));
  await press('Play the easter egg sound');
  expect(mockAudioPlayer.seekTo).toHaveBeenCalledWith(0);
  await press('Close hidden selector');
  expect(mockAudioPlayer.pause).toHaveBeenCalled();
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  expect(hasText('LeTeam')).toBe(false);
  await ReactTestRenderer.act(() => button('Home').props.onPressIn());
  await press('Home');
  expect(hasText('Welcome back, Frank.')).toBe(true);
});

test('opening the selector pauses the exercise without losing the current timer', async () => {
  (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(new Error('Haptics unavailable'));
  await press('Start routine');
  await press('Start exercise');
  await advanceTime(1200);
  const saved = timerText();
  await ReactTestRenderer.act(async () => button('Home').props.onLongPress());
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
  await press('Flip the LeBron image');
  await press('Flip the LeBron image');
  expect(Accelerometer.addListener).toHaveBeenCalledTimes(1);
  expect(remove).not.toHaveBeenCalled();
  await press('Close hidden selector');
  expect(remove).toHaveBeenCalledTimes(1);
});

afterEach(async () => {
  await ReactTestRenderer.act(() => renderer.unmount());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('gives every flip a 10 percent NFL chance with its matching sound', async () => {
  await ReactTestRenderer.act(async () => button('Home').props.onLongPress());
  (Math.random as jest.Mock).mockReturnValue(0.099);
  await press('Flip the LeBron image');
  expect(renderer.root.findByProps({accessibilityLabel: 'LeBron James holding a football in a Dallas Cowboys cap.'})).toBeDefined();
  expect(useAudioPlayer).toHaveBeenLastCalledWith(require('../assets/easter-egg/nfl-on-fox-theme-music.mp3'));
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(2);
  expect(mockAudioPlayer.pause).toHaveBeenCalledTimes(1);

  // Consecutive NFL rolls still restart the matching sound.
  await press('Flip the LeBron image');
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(3);
  (Math.random as jest.Mock).mockReturnValue(0.1);
  await press('Flip the LeBron image');
  expect(renderer.root.findByProps({accessibilityLabel: 'LeBron James, number 76.'})).toBeDefined();
  expect(useAudioPlayer).toHaveBeenLastCalledWith(require('../assets/easter-egg/bang-basketball_Y4765Ub.mp3'));
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(4);
});

test('waits for the current sound to load and does not autoplay again after a pause', async () => {
  (useAudioPlayerStatus as jest.Mock).mockReturnValue({ isLoaded: false, playing: false });
  await ReactTestRenderer.act(async () => button('Home').props.onLongPress());
  expect(mockAudioPlayer.play).not.toHaveBeenCalled();
  (useAudioPlayerStatus as jest.Mock).mockReturnValue({ isLoaded: true, playing: false });
  await ReactTestRenderer.act(() => renderer.update(<App />));
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1);
  (useAudioPlayerStatus as jest.Mock).mockReturnValue({ isLoaded: true, playing: true });
  await ReactTestRenderer.act(() => renderer.update(<App />));
  await press('Pause the easter egg sound');
  (useAudioPlayerStatus as jest.Mock).mockReturnValue({ isLoaded: true, playing: false });
  await ReactTestRenderer.act(() => renderer.update(<App />));
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1);
});

test('waits for the native player when status events still describe the previous clip', async () => {
  await ReactTestRenderer.act(async () => button('Home').props.onLongPress());
  mockAudioPlayer.isLoaded = false;
  await press('Flip the LeBron image');
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1);
  expect(button('Play the easter egg sound').props.disabled).toBe(true);
  mockAudioPlayer.isLoaded = true;
  await ReactTestRenderer.act(() => renderer.update(<App />));
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(2);
});

test('does not restart autoplay when playback briefly reports loading again', async () => {
  await ReactTestRenderer.act(async () => button('Home').props.onLongPress());
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1);
  mockAudioPlayer.isLoaded = false;
  (useAudioPlayerStatus as jest.Mock).mockReturnValue({ isLoaded: false, playing: false });
  await ReactTestRenderer.act(() => renderer.update(<App />));
  mockAudioPlayer.isLoaded = true;
  (useAudioPlayerStatus as jest.Mock).mockReturnValue({ isLoaded: true, playing: false });
  await ReactTestRenderer.act(() => renderer.update(<App />));
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1);
  expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
  expect(mockAudioPlayer.seekTo).not.toHaveBeenCalled();
  await press('Flip the LeBron image');
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(2);
  expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
});

test('cancels pending autoplay when the photo changes or the selector closes', async () => {
  let resolveFirst!: () => void;
  let resolveSecond!: () => void;
  (setAudioModeAsync as jest.Mock)
    .mockImplementationOnce(() => new Promise<void>(resolve => { resolveFirst = resolve; }))
    .mockImplementationOnce(() => new Promise<void>(resolve => { resolveSecond = resolve; }));
  await ReactTestRenderer.act(async () => button('Home').props.onLongPress());
  await press('Flip the LeBron image');
  await ReactTestRenderer.act(async () => resolveFirst());
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1);
  expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
  await press('Close hidden selector');
  await ReactTestRenderer.act(async () => button('Home').props.onLongPress());
  await press('Close hidden selector');
  await ReactTestRenderer.act(async () => resolveSecond());
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1);
});

test('lets the user retry if automatic playback fails', async () => {
  (setAudioModeAsync as jest.Mock).mockRejectedValueOnce(new Error('Audio unavailable'));
  await ReactTestRenderer.act(async () => button('Home').props.onLongPress());
  expect(hasText('The sound couldn’t play. Please try again.')).toBe(true);
  await press('Play the easter egg sound');
  expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1);
  expect(hasText('The sound couldn’t play. Please try again.')).toBe(false);
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
  expect(hasText("No care team conversations yet. Your linked providers will appear here.")).toBe(true);
  await press('Home');
  await press('View messages');
  expect(button('Messages').props.accessibilityState.selected).toBe(true);
  await press('Home');
  expect(hasText('Not started')).toBe(true);
});

test('expands one exercise preview at a time without starting the routine', async () => {
  await press('View routine');
  expect(button('Push Ups information').props.accessibilityState.expanded).toBe(false);
  expect(button('Push Ups information').props['aria-expanded']).toBe(false);
  await press('Push Ups information');
  expect(button('Push Ups information').props.accessibilityState.expanded).toBe(true);
  expect(button('Push Ups information').props['aria-expanded']).toBe(true);
  expect(hasText(exerciseOverviews[0])).toBe(true);
  expect(hasText('3 Sets')).toBe(true);
  expect(hasText('5 Reps')).toBe(true);

  await press('Quad Stretch information');
  expect(button('Push Ups information').props.accessibilityState.expanded).toBe(false);
  expect(button('Quad Stretch information').props.accessibilityState.expanded).toBe(true);
  expect(hasText(exerciseOverviews[0])).toBe(false);
  expect(hasText(exerciseOverviews[2])).toBe(true);
  expect(hasText('1 Set')).toBe(true);
  expect(hasText('30 Seconds')).toBe(true);
  expect(hasText('5 Reps')).toBe(true); // Collapsed rows retain their prescription stats.

  await press('Quad Stretch information');
  expect(button('Quad Stretch information').props.accessibilityState.expanded).toBe(false);
  expect(hasText(exerciseOverviews[2])).toBe(false);
  await advanceTime(2000);
  await press('Home');
  expect(hasText('Not started')).toBe(true);
  expect(hasText('0 of 4 exercises complete')).toBe(true);
});

test.each(['Start routine', "Start today's routine"])(
  '%s opens the first introduction and waits for an explicit exercise start',
  async startLabel => {
    if (startLabel === "Start today's routine") {
      await press('View routine');
      await press('Leg Stretch information');
    }
    await press(startLabel);
    expectIntroduction(0);
    await advanceTime(2500);
    await press('Start exercise');
    expect(hasText('Set 1 of 3')).toBe(true);
    expect(timerText()).toBe('00.00.00');
    await advanceTime(100);
    expect(timerText()).toBe('00.00.10');
  },
);

test('resumes introductions across tabs without starting or changing the exercise', async () => {
  await press('Start routine');
  expectIntroduction(0);
  await press('Home');
  await advanceTime(2000);
  await press('Messages');
  await press('Resume routine');
  expectIntroduction(0);
  await press('Routines');
  await press('Leg Stretch information');
  await press('Continue routine');
  expectIntroduction(0);

  await press('Start exercise');
  await finishExercise(3);
  await press('Next exercise');
  expectIntroduction(1);
  await press('Start exercise');
  await finishExercise(3);
  await press('Next exercise');
  expectIntroduction(2);
  expect(hasText('30 Seconds')).toBe(true);
  await advanceTime(5000);
  await press('Routines');
  await press('Push Ups information');
  await press('Continue routine');
  expectIntroduction(2);
  await press('Messages');
  await press('Resume routine');
  expectIntroduction(2);
  await press('Home');
  expect(hasText('2 of 4 exercises complete')).toBe(true);
  await press('Resume routine');
  await press('Start exercise');
  expect(timerText()).toBe('00.30.00');
  await advanceTime(100);
  expect(timerText()).toBe('00.29.90');
});

test('pauses between tabs and resumes the same exercise, set, and timer', async () => {
  await press('Start routine');
  await press('Start exercise');
  expect(hasText('How to do it')).toBe(true);
  expect(hasText(exerciseOverviews[0])).toBe(true);
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
  await press('Leg Stretch information');
  expect(hasText(exerciseOverviews[3])).toBe(true);
  expect(hasText('30 Seconds')).toBe(true);
  await press('Push Ups information');
  expect(hasText(exerciseOverviews[0])).toBe(true);
  await advanceTime(2000);
  await press('Continue routine');
  expect(hasText('Set 2 of 3')).toBe(true);
  expect(hasText(exerciseOverviews[0])).toBe(true);
  expect(timerText()).toBe(savedTime);
  await advanceTime(100);
  expect(timerText()).not.toBe(savedTime);
});

test('preserves exercise review and counts a finished exercise only once', async () => {
  await press('Start routine');
  await press('Start exercise');
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
  await press('Sit Ups information');
  await press('Continue routine');
  expect(hasText('You finished Push Ups')).toBe(true);
  expect(button('Exercise felt good').props.accessibilityState.selected).toBe(
    true,
  );
  await press('Home');
  await press('Resume routine');
  expect(hasText('You finished Push Ups')).toBe(true);
  await press('Next exercise');
  await press('Start exercise');
  expect(hasText('Sit Ups')).toBe(true);
  expect(hasText('Set 1 of 3')).toBe(true);
  await press('Home');
  expect(hasText('1 of 4 exercises complete')).toBe(true);
});

test('keeps completion and the final review until an explicit restart', async () => {
  await press('Start routine');
  for (const [index, sets] of [3, 3, 1, 1].entries()) {
    expectIntroduction(index);
    await press('Start exercise');
    exerciseOverviews.forEach((overview, overviewIndex) => {
      expect(hasText(overview)).toBe(overviewIndex === index);
    });
    await finishExercise(sets);
    await press('Next exercise');
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
  expect(hasText('Up next')).toBe(true);
  expect(hasText('Exercise 1 of 4')).toBe(true);
  expect(renderer.root.findAllByProps({testID: 'exercise-timer'})).toHaveLength(0);
  await press('Start exercise');
  expect(hasText('Set 1 of 3')).toBe(true);
  expect(timerText()).toBe('00.00.00');
  await press('Home');
  expect(hasText('0 of 4 exercises complete')).toBe(true);
  expect(hasText('In progress')).toBe(true);
});

test('does not double-count repeated finish taps', async () => {
  await press('Start routine');
  await press('Start exercise');
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
  await press('Start exercise');
  for (let exercise = 0; exercise < 2; exercise += 1) {
    await finishExercise(3);
    await press('Next exercise');
    await press('Start exercise');
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
  await press('Start exercise');
  await finishExercise(3);
  await ReactTestRenderer.act(() => renderer.unmount());
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(hasText('Not started')).toBe(true);
  expect(hasText('0 of 4 exercises complete')).toBe(true);
});
