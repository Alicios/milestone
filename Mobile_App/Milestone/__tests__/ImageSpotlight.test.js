import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { RadialGradient } from 'react-native-svg';
import ReactTestRenderer from 'react-test-renderer';
import ImageSpotlight from '../components/ImageSpotlight';

let renderer;
let preferenceChanged;
beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_, callback) => { preferenceChanged = callback; return { remove: jest.fn() }; });
});
afterEach(async () => { if (renderer) await ReactTestRenderer.act(async () => renderer.unmount()); jest.restoreAllMocks(); });

test('matches the web spotlight and follows the existing tilt without intercepting taps', async () => {
  const tilt = new Animated.ValueXY({ x: 0, y: 0 });
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<ImageSpotlight tilt={tilt} motionStatus="active" />); });
  const overlay = renderer.root.findByProps({ testID: 'easter-egg-spotlight' });
  expect(overlay.props.pointerEvents).toBe('none');
  await ReactTestRenderer.act(async () => overlay.props.onLayout({ nativeEvent: { layout: { width: 400, height: 200 } } }));
  expect(renderer.root.findByType(RadialGradient).props.cx).toBe(168);
  expect(renderer.root.findByType(RadialGradient).props.cy).toBe(76);
  await ReactTestRenderer.act(async () => tilt.setValue({ x: 10, y: -10 }));
  expect(renderer.root.findByType(RadialGradient).props.cx).toBe(228);
  expect(renderer.root.findByType(RadialGradient).props.cy).toBe(106);
  await ReactTestRenderer.act(async () => preferenceChanged(true));
  expect(renderer.toJSON()).toBeNull();
  await ReactTestRenderer.act(async () => preferenceChanged(false));
  expect(renderer.root.findByType(RadialGradient)).toBeDefined();
});
