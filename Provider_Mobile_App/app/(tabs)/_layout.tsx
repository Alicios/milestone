import React from 'react';
import { Tabs } from 'expo-router';
import { UsersRound, MessageCircle, CircleUserRound } from 'lucide-react-native';
import { useTheme } from '../../src/ui/theme';
import { useInbox } from '../../src/messages/InboxProvider';

export default function TabLayout() {
  const { colors } = useTheme();
  const { conversations } = useInbox();
  const unread = conversations.reduce((sum, item) => sum + item.unread, 0);
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.teal, tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 68, paddingTop: 9 },
    tabBarLabelStyle: { fontFamily: 'Montserrat_600SemiBold', fontSize: 11, marginTop: 3 }, sceneStyle: { backgroundColor: colors.bg } }}>
    <Tabs.Screen name="index" options={{ title: 'Patients', tabBarIcon: ({ color, size }) => <UsersRound color={color} size={size} /> }} />
    <Tabs.Screen name="messages" options={{ title: 'Messages', tabBarBadge: unread ? unread > 99 ? '99+' : unread : undefined, tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} /> }} />
    <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color, size }) => <CircleUserRound color={color} size={size} /> }} />
  </Tabs>;
}
