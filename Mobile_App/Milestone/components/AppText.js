import React from 'react';
import { StyleSheet, Text } from 'react-native';

const fontFamilies = {
  400: 'Montserrat_400Regular',
  500: 'Montserrat_500Medium',
  600: 'Montserrat_600SemiBold',
  700: 'Montserrat_700Bold',
  800: 'Montserrat_800ExtraBold',
};

// Resolve each weight to its bundled face on both iOS and Android.
export default function AppText({ style, ...props }) {
  const { fontWeight = '400' } = StyleSheet.flatten(style) || {};
  const weight = fontWeight === 'bold' ? 700 : Number(fontWeight) || 400;
  const fontFamily = fontFamilies[Math.min(800, Math.max(400, weight))];

  return (
    <Text
      {...props}
      style={[style, { fontFamily, fontWeight: 'normal', fontStyle: 'normal' }]}
    />
  );
}
