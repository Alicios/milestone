import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useAppTheme } from './AppTheme';

const thumbSize = 28;

export default function PainSlider({ value, onChange, disabled = false }) {
  const { colors, mode } = useAppTheme();
  const [width, setWidth] = useState(0);
  const trackColors = mode === 'dark' ? ['#76bd92', '#e8c36a', '#ec9297'] : ['#44845c', '#d3a127', '#bf4b55'];
  const fraction = ((value ?? 1) - 1) / 9;
  const valueText = value == null ? 'Choose a pain score from 1 to 10' : `${value} out of 10`;
  const change = next => {
    if (!disabled) onChange(Math.max(1, Math.min(10, Math.round(next))));
  };
  const changeFromTouch = event => {
    if (width > thumbSize) change(1 + 9 * (event.nativeEvent.locationX - thumbSize / 2) / (width - thumbSize));
  };
  const step = amount => change(value == null ? 1 : value + amount);

  return (
    <View
      testID="pain-slider"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Pain level"
      accessibilityHint="Slide to choose a score from 1, least pain, to 10, most pain."
      accessibilityState={{ disabled }}
      accessibilityValue={{ min: 1, max: 10, ...(value == null ? {} : { now: value }), text: valueText }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent: { actionName } }) => {
        if (actionName === 'increment') step(1);
        if (actionName === 'decrement') step(-1);
      }}
      {...(Platform.OS === 'web' ? {
        tabIndex: disabled ? -1 : 0,
        'aria-valuemin': 1,
        'aria-valuemax': 10,
        'aria-valuenow': value ?? undefined,
        'aria-valuetext': valueText,
        'aria-required': true,
        onKeyDown: event => {
          if (disabled) return;
          if (['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            if (event.key === 'Home') change(1);
            else if (event.key === 'End') change(10);
            else step(['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1);
          }
        },
      } : {})}
      onLayout={({ nativeEvent: { layout } }) => setWidth(layout.width)}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderGrant={changeFromTouch}
      onResponderMove={changeFromTouch}
      onResponderTerminationRequest={() => false}
      style={[styles.control, disabled && styles.disabled, Platform.OS === 'web' && styles.webControl]}
    >
      <View pointerEvents="none" style={styles.track}>
        <View style={[styles.shortSegment, { backgroundColor: trackColors[0] }]} />
        <View style={[styles.shortSegment, { backgroundColor: trackColors[1] }]} />
        <View style={[styles.longSegment, { backgroundColor: trackColors[2] }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, {
        left: fraction * Math.max(0, width - thumbSize),
        backgroundColor: colors.surface,
        borderColor: colors.text,
      }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  control: { height: 56, justifyContent: 'center', alignSelf: 'stretch' },
  disabled: { opacity: 0.6 },
  webControl: { cursor: 'pointer', touchAction: 'none' },
  track: { height: 8, marginHorizontal: thumbSize / 2, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  shortSegment: { height: 8, flex: 3 },
  longSegment: { height: 8, flex: 4 },
  thumb: { position: 'absolute', top: 14, width: thumbSize, height: thumbSize, borderRadius: thumbSize / 2, borderWidth: 3 },
});
