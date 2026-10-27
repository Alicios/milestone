import React, { createContext, useContext, useMemo } from 'react';
import { StatusBar, StyleSheet, useColorScheme } from 'react-native';

const light = {
  background: '#F4EACF', surface: '#FFFDF7', raised: '#EDF2E9', primary: '#357F83', brand: '#125b75', accent: '#E9611C',
  text: '#193333', muted: '#357F83', border: '#B7CAC2', error: '#A83E14', onAccent: '#FFFDF7', tint: '#9BCBC5',
};
// Mirrors the web application's dark palette in Web_App/src/theme.ts.
const dark = {
  background: '#102b34', surface: '#1b3c46', raised: '#254c56', primary: '#91c8c0', brand: '#91c8c0', accent: '#d9822b',
  text: '#f3f8f8', muted: '#b7cbd0', border: '#47616a', error: '#ffad8a', onAccent: '#102b34', tint: '#254c56',
};

export function resolveAppearance(preference, device) {
  return preference === 'system' ? (device === 'dark' ? 'dark' : 'light') : preference;
}

function makeTheme(mode) {
  const colors = mode === 'dark' ? dark : light;
  return { mode, colors, barStyle: mode === 'dark' ? 'light-content' : 'dark-content',
    palette: mode === 'dark' ? { cream: dark.background, white: dark.onAccent, ink: dark.text, tealDark: dark.primary, teal: dark.tint, blue: dark.primary, orange: dark.accent, orangeDark: dark.accent } : null,
  };
}
const AppThemeContext = createContext(makeTheme('light'));

export function AppThemeProvider({ children, preference = 'system' }) {
  const device = useColorScheme();
  const mode = resolveAppearance(preference, device);
  const theme = useMemo(() => makeTheme(mode), [mode]);
  return <AppThemeContext.Provider value={theme}><StatusBar barStyle={theme.barStyle} />{children}</AppThemeContext.Provider>;
}

export function useAppTheme() { return useContext(AppThemeContext); }

// Retain the approved light styles and map their color roles into the dark theme.
// Geometry, artwork, and exercise imagery never change with appearance.
export function themeColor(value, property, colors) {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) return value;
  const color = value.toUpperCase();
  if (color === '#A83E14' || color === '#B84613') return colors.error;
  if (/border/i.test(property)) return colors.border;
  if (property === 'shadowColor') return '#000000';
  if (property === 'backgroundColor') {
    if (color === '#F4EACF') return colors.background;
    if (['#FFFDF7', '#FFFFFF'].includes(color)) return colors.surface;
    if (['#193333', '#125B75', '#357F83', '#55A7B7'].includes(color)) return colors.primary;
    if (['#E9611C', '#D9822B'].includes(color)) return colors.accent;
    return colors.raised;
  }
  if (['#FFFDF7', '#FFFFFF', '#F4EACF'].includes(color)) return colors.onAccent;
  if (color === '#193333') return colors.text;
  if (color === '#125B75') return colors.brand;
  if (['#357F83', '#55A7B7'].includes(color)) return colors.primary;
  return colors.muted;
}

export function useThemedStyles(base) {
  const { mode, colors } = useAppTheme();
  return useMemo(() => {
    if (mode === 'light') return base;
    return StyleSheet.create(Object.fromEntries(Object.entries(base).map(([name, style]) => [name,
      Object.fromEntries(Object.entries(StyleSheet.flatten(style)).map(([property, value]) => [property, themeColor(value, property, colors)])),
    ])));
  }, [base, mode, colors]);
}
