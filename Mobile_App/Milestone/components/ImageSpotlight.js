import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

export default function ImageSpotlight({ tilt, motionStatus }) {
  const [reducedMotion, setReducedMotion] = useState(true);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [position, setPosition] = useState({ x: 42, y: 38 });
  const disabled = reducedMotion || motionStatus === 'reduced';

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (disabled) return undefined;
    const listener = tilt.addListener(({ x, y }) => {
      // Same spotlight position and tilt response as Web_App's AboutUsPage.
      setPosition({ x: Math.max(8, Math.min(92, 42 - y * 1.5)), y: Math.max(8, Math.min(92, 38 + x * 1.5)) });
    });
    return () => tilt.removeListener(listener);
  }, [tilt, disabled]);

  if (disabled) return null;
  const cx = size.width * position.x / 100;
  const cy = size.height * position.y / 100;
  // CSS radial-gradient(circle ...) uses the distance to the farthest corner.
  const radius = Math.hypot(Math.max(cx, size.width - cx), Math.max(cy, size.height - cy));
  return (
    <View testID="easter-egg-spotlight" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill} onLayout={({ nativeEvent: { layout } }) => {
      if (layout.width > 0 && layout.height > 0) setSize({ width: layout.width, height: layout.height });
    }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${size.width} ${size.height}`} accessible={false}>
        <Defs>
          <RadialGradient id="imageSpotlight" gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={radius}>
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.46} />
            <Stop offset="0.16" stopColor="#FFFFFF" stopOpacity={0.14} />
            <Stop offset="0.44" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size.width} height={size.height} fill="url(#imageSpotlight)" />
      </Svg>
    </View>
  );
}
