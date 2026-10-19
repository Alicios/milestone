import React from 'react';
import * as Native from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Accelerometer } from 'expo-sensors';
import useImageMotionTilt from '../components/useImageMotionTilt';

jest.mock('expo-sensors', () => ({
  Accelerometer: {
    isAvailableAsync: jest.fn(), getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(),
    setUpdateInterval: jest.fn(), addListener: jest.fn(),
  },
}));

let result;
let renderer;
let reading;
let preferenceChanged;
let appStateChanged;
let removeSensor;
let dimensions;
let queuedFrames;
let frameId;
const originalPlatform = Native.Platform.OS;

function flushFrame() {
  const callbacks = [...queuedFrames.values()]; queuedFrames.clear();
  callbacks.forEach(callback => callback(0));
}
async function applyReading(value) {
  await ReactTestRenderer.act(async () => { reading(value); flushFrame(); });
}

function Probe() {
  result = useImageMotionTilt();
  return null;
}

async function mount() {
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Probe />); });
}

beforeEach(() => {
  jest.clearAllMocks();
  renderer = null;
  queuedFrames = new Map(); frameId = 0;
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => { queuedFrames.set(++frameId, callback); return frameId; });
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => queuedFrames.delete(id));
  Native.Platform.OS = 'ios';
  Native.AppState.currentState = 'active';
  dimensions = jest.fn(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 }));
  jest.spyOn(require('react-native'), 'useWindowDimensions', 'get').mockReturnValue(dimensions);
  jest.spyOn(Native.AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(Native.AccessibilityInfo, 'addEventListener').mockImplementation((_, listener) => {
    preferenceChanged = listener;
    return { remove: jest.fn() };
  });
  jest.spyOn(Native.AppState, 'addEventListener').mockImplementation((_, listener) => {
    appStateChanged = listener;
    return { remove: jest.fn() };
  });
  jest.spyOn(Native.Animated, 'timing').mockImplementation((value, options) => ({
    start: () => value.setValue(options.toValue), stop: jest.fn(), reset: jest.fn(),
  }));
  Accelerometer.isAvailableAsync.mockResolvedValue(true);
  Accelerometer.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  Accelerometer.requestPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  removeSensor = jest.fn();
  Accelerometer.addListener.mockImplementation(listener => {
    reading = listener;
    return { remove: removeSensor };
  });
});

afterEach(async () => {
  if (renderer) await ReactTestRenderer.act(async () => renderer.unmount());
  Native.Platform.OS = originalPlatform;
  jest.restoreAllMocks();
});

test('calibrates at opening and drives bounded tilt from accelerometer readings', async () => {
  await mount();
  expect(result.status).toBe('active');
  expect(Accelerometer.setUpdateInterval).toHaveBeenCalledWith(8);
  await applyReading({ x: 0, y: 0, z: 1 });
  expect(result.tilt.__getValue()).toEqual({ x: 0, y: 0 });
  await applyReading({ x: 1, y: 1, z: -1 });
  const values = result.tilt.__getValue();
  expect(values.x).toBeLessThan(0);
  expect(values.y).toBeGreaterThan(0);
  expect(values.x).toBe(-45);
  expect(values.y).toBeGreaterThan(12);
  expect(Math.abs(values.x)).toBeLessThanOrEqual(45);
  expect(Math.abs(values.y)).toBeLessThanOrEqual(45);
  expect(Native.Animated.timing).toHaveBeenCalledWith(result.tilt, expect.objectContaining({ duration: 0, easing: Native.Easing.linear, useNativeDriver: true }));
  await applyReading({ x: NaN, y: 0, z: 1 });
  expect(result.tilt.__getValue()).toEqual(values);
});

test('stops in background and recalibrates when foregrounded or rotated', async () => {
  await mount();
  await applyReading({ x: 0, y: 0, z: 1 });
  await applyReading({ x: 0.7, y: 0.2, z: 0.8 });
  await ReactTestRenderer.act(async () => appStateChanged('background'));
  expect(removeSensor).toHaveBeenCalledTimes(1);
  expect(result.tilt.__getValue()).toEqual({ x: 0, y: 0 });
  await ReactTestRenderer.act(async () => appStateChanged('active'));
  await applyReading({ x: 0.7, y: 0.2, z: 0.8 });
  expect(result.tilt.__getValue()).toEqual({ x: 0, y: 0 });
  dimensions.mockReturnValue({ width: 844, height: 390, scale: 1, fontScale: 1 });
  await ReactTestRenderer.act(async () => renderer.update(<Probe />));
  expect(removeSensor).toHaveBeenCalledTimes(2);
  await applyReading({ x: -1, y: 0, z: 0 });
  expect(result.tilt.__getValue()).toEqual({ x: 0, y: 0 });
});

test('respects Reduce Motion and removes the subscription when closed', async () => {
  await mount();
  await ReactTestRenderer.act(async () => preferenceChanged(true));
  expect(result.status).toBe('reduced');
  expect(removeSensor).toHaveBeenCalledTimes(1);
  Native.AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(false);
  await ReactTestRenderer.act(async () => preferenceChanged(false));
  expect(result.status).toBe('active');
  await ReactTestRenderer.act(async () => renderer.unmount());
  renderer = null;
  expect(removeSensor).toHaveBeenCalledTimes(2);
});

test('does not subscribe when motion is unavailable, denied, or reduced', async () => {
  Accelerometer.isAvailableAsync.mockResolvedValue(false);
  await mount();
  expect(result.status).toBe('unavailable');
  expect(Accelerometer.addListener).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
  Accelerometer.isAvailableAsync.mockResolvedValue(true);
  Accelerometer.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
  await mount();
  expect(result.status).toBe('blocked');
  expect(Accelerometer.addListener).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
  Native.AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true);
  await mount();
  expect(result.status).toBe('reduced');
  expect(Accelerometer.addListener).not.toHaveBeenCalled();
});

test('a permission response after closing cannot start a sensor subscription', async () => {
  let finish;
  Accelerometer.getPermissionsAsync.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await mount();
  await ReactTestRenderer.act(async () => renderer.unmount());
  renderer = null;
  await ReactTestRenderer.act(async () => finish({ granted: true, canAskAgain: true }));
  expect(Accelerometer.addListener).not.toHaveBeenCalled();
});

test('coalesces fast sensor readings into one display frame without interpolation delay', async () => {
  await mount(); await applyReading({ x: 0, y: 0, z: 1 });
  await ReactTestRenderer.act(async () => {
    reading({ x: 0.1, y: 0.1, z: 1 });
    reading({ x: 0.3, y: 0.3, z: 1 });
    reading({ x: 1, y: 1, z: -1 });
  });
  expect(queuedFrames.size).toBe(1);
  expect(result.tilt.__getValue()).toEqual({ x: 0, y: 0 });
  await ReactTestRenderer.act(async () => flushFrame());
  expect(result.tilt.__getValue().x).toBe(-45);
  expect(Native.Animated.timing).toHaveBeenCalledTimes(1);
});

test('touch takes control up to 45 degrees and releases back to the latest sensor tilt', async () => {
  await mount(); await applyReading({ x: 0, y: 0, z: 1 });
  expect(result.touchEnabled).toBe(true);
  await ReactTestRenderer.act(async () => { result.beginTouch(); result.moveTouch(200, -100, 400, 200); flushFrame(); });
  expect(result.tilt.__getValue()).toEqual({ x: 45, y: 45 });
  await applyReading({ x: 0, y: 0.5, z: 1 });
  expect(result.tilt.__getValue()).toEqual({ x: 45, y: 45 });
  await ReactTestRenderer.act(async () => { result.endTouch(); flushFrame(); });
  expect(result.tilt.__getValue().x).toBeLessThan(0);
  expect(result.tilt.__getValue().y).toBe(0);
  await ReactTestRenderer.act(async () => preferenceChanged(true));
  expect(result.touchEnabled).toBe(false);
  await ReactTestRenderer.act(async () => { result.beginTouch(); result.moveTouch(200, 100, 400, 200); flushFrame(); });
  expect(result.tilt.__getValue()).toEqual({ x: 0, y: 0 });
});

test('touch works without accelerometer support and queued updates stop in the background', async () => {
  Native.Platform.OS = 'web';
  await mount();
  expect(result.status).toBe('unavailable'); expect(result.touchEnabled).toBe(true);
  expect(Accelerometer.addListener).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { result.beginTouch(); result.moveTouch(-200, 100, 400, 200); flushFrame(); });
  expect(result.tilt.__getValue()).toEqual({ x: -45, y: -45 });
  await ReactTestRenderer.act(async () => result.moveTouch(200, -100, 400, 200));
  expect(queuedFrames.size).toBe(1);
  await ReactTestRenderer.act(async () => appStateChanged('background'));
  expect(queuedFrames.size).toBe(0); expect(result.touchEnabled).toBe(false);
  expect(result.tilt.__getValue()).toEqual({ x: 0, y: 0 });
});
