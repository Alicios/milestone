import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
export type Appearance = 'system' | 'light' | 'dark';
const light = { bg: '#F4EACF', surface: '#FFFDF7', soft: '#E7F1EC', ink: '#193333', muted: '#586F6B', border: '#D5DED3', teal: '#357F83', accent: '#E9611C', onAccent: '#FFFFFF', error: '#A52C3A' };
const dark: typeof light = { bg: '#142B2C', surface: '#1D3839', soft: '#294747', ink: '#F5EEDC', muted: '#B4CAC4', border: '#466260', teal: '#9BCBC5', accent: '#EF824B', onAccent: '#142B2C', error: '#FFB2BA' };
const Context = createContext({ colors: light, mode: 'light' as 'light' | 'dark', appearance: 'system' as Appearance, setAppearance: (_value: Appearance) => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [appearance, setAppearance] = useState<Appearance>('system');
  const mode = appearance === 'system' ? system === 'dark' ? 'dark' : 'light' : appearance;
  const value = useMemo(() => ({ colors: mode === 'dark' ? dark : light, mode, appearance, setAppearance }), [mode, appearance]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useTheme = () => useContext(Context);
