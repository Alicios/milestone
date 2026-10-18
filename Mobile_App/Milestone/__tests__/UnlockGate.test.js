import React from 'react';
import { AppState, Pressable, Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import UnlockGate from '../components/UnlockGate';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

let renderer;

function patientHome({ onLock }) {
  return (
    <>
      <Text>Patient profile home</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Lock Milestone" onPress={onLock}>
        <Text>Lock</Text>
      </Pressable>
    </>
  );
}

function textIncludes(value) {
  const textOf = node => node.children.map(child => typeof child === 'string' ? child : textOf(child)).join('');
  return renderer.root.findAllByType(Text).some(node => textOf(node).includes(value));
}

function button(label) {
  return renderer.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
    .find(node => node.props.accessibilityLabel === label);
}

async function inputPin(value) {
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(TextInput).props.onChangeText(value);
  });
}

async function pressUnlock() {
  await ReactTestRenderer.act(async () => button('Unlock Milestone').props.onPress());
}

beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => {
    return { remove: jest.fn() };
  });
});

afterEach(async () => {
  if (renderer) await ReactTestRenderer.act(async () => renderer.unmount());
  jest.restoreAllMocks();
});

test('opens the patient home with PIN 0000 and relocks when requested', async () => {
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<UnlockGate>{patientHome}</UnlockGate>);
  });

  expect(textIncludes('Preparing your PIN unlock')).toBe(false);
  expect(textIncludes('Patient profile home')).toBe(false);

  await inputPin('1234');
  await pressUnlock();
  expect(textIncludes('That PIN doesn’t match')).toBe(true);
  expect(textIncludes('Patient profile home')).toBe(false);

  await inputPin('0000');
  await pressUnlock();
  expect(textIncludes('Patient profile home')).toBe(true);

  await ReactTestRenderer.act(async () => button('Lock Milestone').props.onPress());
  expect(renderer.root.findByProps({ importantForAccessibility: 'no-hide-descendants' }).props.style).toEqual({ display: 'none' });
  expect(button('Unlock Milestone')).toBeDefined();
});
