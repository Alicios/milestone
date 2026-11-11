import React, { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Star } from 'lucide-react-native';
import { useInbox } from '../../src/messages/InboxProvider';
import { Avatar, Card, ChevronRight, Empty, Field, Heading, Notice, Screen, Text } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function MessagesScreen() {
  const inbox = useInbox();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  useFocusEffect(React.useCallback(() => { void inbox.refresh(); }, [inbox.refresh]));
  const conversations = inbox.conversations.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <Screen refreshControl={<RefreshControl refreshing={inbox.loading} onRefresh={() => void inbox.refresh()} tintColor={colors.teal} />}>
    <Heading eyebrow="Keep the conversation going" title="Messages" detail="A direct connection with the people in your care." />
    <View style={{ marginBottom: 20 }}><Field label="Find a conversation" placeholder="Search by patient name" value={search} onChangeText={setSearch} /></View>
    {inbox.error ? <Notice message={inbox.error} onRetry={() => void inbox.refresh()} /> : null}
    {inbox.loading ? <ActivityIndicator accessibilityLabel="Loading conversations" color={colors.teal} /> : null}
    <View style={{ gap: 12 }}>{conversations.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}${item.unread ? `, ${item.unread} unread` : ''}`} onPress={() => router.push({ pathname: '/conversation/[profileId]', params: { profileId: item.id } })}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}><Avatar name={item.name} /><View style={{ flex: 1, gap: 5 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Text weight="semibold" style={{ flexShrink: 1 }}>{item.name}</Text>{item.starred && <Star size={14} color={colors.accent} fill={colors.accent} />}</View><Text numberOfLines={2} style={{ fontSize: 12, color: colors.muted }}>{item.preview}</Text>{item.lastMessageAt && <Text style={{ fontSize: 10, color: colors.muted }}>{new Date(item.lastMessageAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text>}</View>{item.unread > 0 && <View style={{ borderRadius: 10, minWidth: 25, padding: 4, backgroundColor: colors.accent }}><Text weight="bold" style={{ color: colors.onAccent, fontSize: 11, textAlign: 'center' }}>{item.unread > 99 ? '99+' : item.unread}</Text></View>}<ChevronRight size={18} color={colors.teal} /></Card>
    </Pressable>)}</View>
    {!inbox.loading && !inbox.error && !conversations.length && <Empty title={search ? 'No conversations found' : 'Room for a conversation'} detail={search ? 'Try searching for another patient.' : 'Conversations appear for your existing patient relationships.'} />}
  </Screen>;
}
