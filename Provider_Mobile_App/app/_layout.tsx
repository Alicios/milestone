import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Montserrat_400Regular } from '@expo-google-fonts/montserrat/400Regular';
import { Montserrat_500Medium } from '@expo-google-fonts/montserrat/500Medium';
import { Montserrat_600SemiBold } from '@expo-google-fonts/montserrat/600SemiBold';
import { Montserrat_700Bold } from '@expo-google-fonts/montserrat/700Bold';
import { SessionProvider, useSession } from '../src/auth/SessionProvider';
import { AuthScreen } from '../src/auth/AuthScreen';
import { InboxProvider } from '../src/messages/InboxProvider';
import { Brand } from '../src/ui/components';
import { KeyboardLayout } from '../src/ui/KeyboardLayout';
import { ProviderDock } from '../src/ui/ProviderDock';
import { ThemeProvider, useTheme } from '../src/ui/theme';

function Workspace() {
  const auth = useSession();
  const { colors, mode } = useTheme();
  return <KeyboardLayout><SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.bg }}>
    <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    {auth.phase === 'ready' && auth.provider ? <InboxProvider key={auth.provider.id}><View style={{ flex: 1 }}><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}><Stack.Screen name="(tabs)" /><Stack.Screen name="patient/[profileId]" /><Stack.Screen name="conversation/[profileId]" /><Stack.Screen name="profile" /><Stack.Screen name="settings" /></Stack></View><ProviderDock /></InboxProvider> : <AuthScreen />}
    {auth.covered && <View accessibilityLabel="Workspace locked" style={{ position: 'absolute', inset: 0, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', zIndex: 100 }}><Brand /></View>}
  </SafeAreaView></KeyboardLayout>;
}
export default function RootLayout() {
  useFonts({ Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold });
  return <SafeAreaProvider><ThemeProvider><SessionProvider><Workspace /></SessionProvider></ThemeProvider></SafeAreaProvider>;
}
