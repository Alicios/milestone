import React, { useEffect, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { router, usePathname, useSegments } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, House, LockKeyhole, LogOut, MessageCircle, Settings, UserRound, UsersRound } from 'lucide-react-native';
import { useSession } from '../auth/SessionProvider';
import { useInbox } from '../messages/InboxProvider';
import { ActionSheet } from './ActionSheet';
import { Avatar, Text } from './components';
import { useKeyboardLayout } from '../hooks/useKeyboardLayout';
import { useTheme } from './theme';

export function ProviderDock() {
  const auth = useSession();
  const { colors } = useTheme();
  const { conversations } = useInbox();
  const pathname = usePathname();
  const route = useSegments().filter(segment => !segment.startsWith('('))[0] ?? 'index';
  const [open, setOpen] = useState(false);
  const { visible: keyboard } = useKeyboardLayout();
  const provider = auth.provider!;
  const unread = conversations.filter(item => !item.archived).reduce((sum, item) => sum + item.unread, 0);
  useEffect(() => { setOpen(false); }, [pathname]);
  const homeActive = route === 'index';
  const patientsActive = route === 'patients' || route === 'patient';
  const messagesActive = route === 'messages' || route === 'conversation';
  const profileActive = route === 'profile' || route === 'settings';
  const action = (callback: () => void) => { setOpen(false); callback(); };
  const items = [
    { label: 'Profile', icon: UserRound, onPress: () => router.navigate('/profile') },
    { label: 'App settings', icon: Settings, onPress: () => router.navigate('/settings') },
    { label: 'Lock workspace', icon: LockKeyhole, onPress: auth.lock },
    { label: 'Sign out', icon: LogOut, onPress: () => { void auth.logout(); } },
  ];
  return <>
    {!keyboard && <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 }}>
      <View accessibilityRole="tablist" style={{ width: '100%', maxWidth: 1050, alignSelf: 'center', flexDirection: 'row', minHeight: 72, paddingTop: 8, paddingBottom: 5 }}>
        <Pressable accessibilityRole="tab" accessibilityLabel="Home" accessibilityState={{ selected: homeActive }} aria-selected={homeActive} onPress={() => router.navigate('/')} style={{ flex: 1, gap: 4, alignItems: 'center', justifyContent: 'center', minHeight: 56 }}><House color={homeActive ? colors.accent : colors.muted} size={24} /><Text weight="semibold" style={{ fontSize: 11, lineHeight: 17, color: homeActive ? colors.accent : colors.muted }}>Home</Text></Pressable>
        <Pressable accessibilityRole="tab" accessibilityLabel="Patients" accessibilityState={{ selected: patientsActive }} aria-selected={patientsActive} onPress={() => router.navigate('/patients')} style={{ flex: 1, gap: 4, alignItems: 'center', justifyContent: 'center', minHeight: 56 }}><UsersRound color={patientsActive ? colors.accent : colors.muted} size={24} /><Text weight="semibold" style={{ fontSize: 11, lineHeight: 17, color: patientsActive ? colors.accent : colors.muted }}>Patients</Text></Pressable>
        <Pressable accessibilityRole="tab" accessibilityLabel={unread ? `Messages, ${unread} unread` : 'Messages'} accessibilityState={{ selected: messagesActive }} aria-selected={messagesActive} onPress={() => router.navigate('/messages')} style={{ flex: 1, gap: 4, alignItems: 'center', justifyContent: 'center', minHeight: 56 }}><View><MessageCircle color={messagesActive ? colors.accent : colors.muted} size={24} />{unread > 0 && <View style={{ position: 'absolute', top: -5, right: -17, backgroundColor: colors.accent, borderRadius: 9, minWidth: 19, paddingHorizontal: 4 }}><Text weight="bold" style={{ fontSize: 9, lineHeight: 17, color: colors.onAccent, textAlign: 'center' }}>{unread > 99 ? '99+' : unread}</Text></View>}</View><Text weight="semibold" style={{ fontSize: 11, lineHeight: 17, color: messagesActive ? colors.accent : colors.muted }}>Messages</Text></Pressable>
        <Pressable accessibilityRole="tab" accessibilityLabel="Open profile menu" accessibilityHint="Opens profile, app settings, lock, and sign out" accessibilityState={{ selected: profileActive, expanded: open }} aria-selected={profileActive} aria-expanded={open} onPress={() => { Keyboard.dismiss(); setOpen(true); }} style={{ flex: 1, gap: 3, alignItems: 'center', justifyContent: 'center', minHeight: 56 }}><View style={{ borderRadius: 20, padding: 2, borderColor: profileActive || open ? colors.accent : colors.border, borderWidth: 2 }}><Avatar key={provider.avatarUrl ?? provider.id} name={provider.name} url={provider.avatarUrl} size={28} /></View><Text weight="semibold" style={{ fontSize: 11, lineHeight: 17, color: profileActive ? colors.accent : colors.muted }}>Profile</Text></Pressable>
      </View>
    </SafeAreaView>}
    <ActionSheet visible={open} title="Profile menu" onClose={() => setOpen(false)}>
      <View style={{ flexDirection: 'row', gap: 12, padding: 10, paddingBottom: 18, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border }}><Avatar key={provider.avatarUrl ?? provider.id} name={provider.name} url={provider.avatarUrl} size={44} /><View style={{ flex: 1 }}><Text weight="semibold">{provider.name}</Text><Text style={{ fontSize: 11, color: colors.muted }}>{provider.email}</Text></View></View>
      {items.map(item => <Pressable key={item.label} accessibilityRole="menuitem" onPress={() => action(item.onPress)} style={({ pressed }) => ({ minHeight: 48, borderRadius: 10, padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: pressed ? colors.soft : 'transparent' })}><item.icon color={colors.teal} size={19} /><Text weight="medium" style={{ flex: 1 }}>{item.label}</Text><ChevronRight color={colors.muted} size={16} /></Pressable>)}
    </ActionSheet>
  </>;
}
