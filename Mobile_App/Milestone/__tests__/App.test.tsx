/**
 * @format
 */

import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type {ReactTestInstance} from 'react-test-renderer';
import App from '../App';

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true, null]),
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
  jest.useFakeTimers();
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
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
