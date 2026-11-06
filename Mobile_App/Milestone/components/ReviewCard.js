import React from 'react';
import { StyleSheet, View } from 'react-native';
import Text from './AppText';
import { useThemedStyles } from './AppTheme';

export default function ReviewCard({ title, children, style, testID }) {
  const styles = useThemedStyles(baseStyles);
  return (
    <View testID={testID} style={[styles.card, style]}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  card: {
    backgroundColor: '#9BCBC5',
    borderColor: '#193333',
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: '5%',
    paddingVertical: 20,
  },
  title: {
    color: '#193333',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 16,
  },
});
