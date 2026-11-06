import React from 'react';
import { Platform } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import PainSlider from '../components/PainSlider';

let renderer;
const onChange = jest.fn();
const slider = () => renderer.root.findByProps({ testID: 'pain-slider' });
async function mount(value = null, disabled = false) {
  await act(async () => { renderer = Renderer.create(<PainSlider value={value} disabled={disabled} onChange={onChange} />); });
  await act(async () => slider().props.onLayout({ nativeEvent: { layout: { width: 208 } } }));
}
beforeEach(() => onChange.mockReset());
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  jest.restoreAllMocks();
});

test.each(['ios', 'android'])('%s touch selects whole scores, supports dragging and clamps both ends', async platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  await mount();
  expect(slider().props.accessibilityValue.now).toBeUndefined();
  expect(slider().props.onStartShouldSetResponder()).toBe(true);
  await act(async () => slider().props.onResponderGrant({ nativeEvent: { locationX: 114 } }));
  expect(onChange).toHaveBeenLastCalledWith(6);
  await act(async () => slider().props.onResponderMove({ nativeEvent: { locationX: 194 } }));
  expect(onChange).toHaveBeenLastCalledWith(10);
  await act(async () => slider().props.onResponderMove({ nativeEvent: { locationX: -20 } }));
  expect(onChange).toHaveBeenLastCalledWith(1);
  await act(async () => slider().props.onResponderMove({ nativeEvent: { locationX: 250 } }));
  expect(onChange).toHaveBeenLastCalledWith(10);
});

test('screen-reader adjustments work from an unanswered score and stop at the bounds', async () => {
  await mount();
  await act(async () => slider().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
  expect(onChange).toHaveBeenLastCalledWith(1);
  await act(async () => renderer.update(<PainSlider value={10} onChange={onChange} />));
  expect(slider().props.accessibilityValue).toEqual({ min: 1, max: 10, now: 10, text: '10 out of 10' });
  await act(async () => slider().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
  expect(onChange).toHaveBeenLastCalledWith(10);
  await act(async () => slider().props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
  expect(onChange).toHaveBeenLastCalledWith(9);
});

test('web keyboard supports arrows, Home and End without scrolling', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  await mount(5);
  for (const [key, expected] of [['ArrowRight', 6], ['ArrowDown', 4], ['Home', 1], ['End', 10]]) {
    const preventDefault = jest.fn();
    await act(async () => slider().props.onKeyDown({ key, preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(expected);
  }
});

test('saving disables touch, keyboard and screen-reader changes', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  await mount(5, true);
  expect(slider().props.onStartShouldSetResponder()).toBe(false);
  expect(slider().props.tabIndex).toBe(-1);
  await act(async () => {
    slider().props.onResponderGrant({ nativeEvent: { locationX: 194 } });
    slider().props.onKeyDown({ key: 'End', preventDefault: jest.fn() });
    slider().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
  });
  expect(onChange).not.toHaveBeenCalled();
});
