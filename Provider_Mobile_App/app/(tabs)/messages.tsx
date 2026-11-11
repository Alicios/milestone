import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Archive, ArchiveRestore, Star } from 'lucide-react-native';
import type { Conversation } from '../../src/types';
import { friendlyError } from '../../src/lib/domain';
import { useInbox } from '../../src/messages/InboxProvider';
import { SwipeableConversation } from '../../src/messages/SwipeableConversation';
import { Avatar, Button, Card, ChevronRight, Empty, Field, Heading, Notice, Screen, Text } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function MessagesScreen() {
  const inbox = useInbox();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [archiveView, setArchiveView] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<Conversation | null>(null);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); }; }, []);
  useFocusEffect(React.useCallback(() => { void inbox.refresh(); }, [inbox.refresh]));
  const conversations = inbox.conversations.filter(item => item.archived === archiveView && item.name.toLowerCase().includes(search.trim().toLowerCase()));
  async function changeArchive(item: Conversation, archived: boolean) {
    setError(''); setPending(old => new Set(old).add(item.id));
    try {
      await inbox.setArchived(item, archived);
      if (!mounted.current) return;
      if (timer.current) clearTimeout(timer.current);
      setUndo(archived ? item : null);
      if (archived) timer.current = setTimeout(() => setUndo(null), 7000);
    } catch (cause) {
      if (mounted.current) setError(friendlyError(cause));
      throw cause;
    } finally { if (mounted.current) setPending(old => { const next = new Set(old); next.delete(item.id); return next; }); }
  }
  const run = (item: Conversation, archived: boolean) => { void changeArchive(item, archived).catch(() => {}); };
  return <Screen refreshControl={<RefreshControl refreshing={inbox.loading} onRefresh={() => void inbox.refresh()} tintColor={colors.teal} />}>
    <Heading eyebrow="Keep the conversation going" title={archiveView ? 'Archived conversations' : 'Messages'} detail={archiveView ? 'Your archived conversations. Swipe to move one back to the inbox.' : 'Swipe a conversation left or right to archive it.'}
      action={<Button secondary title={archiveView ? 'Inbox' : 'Archived'} icon={<Archive color={colors.teal} size={17} />} onPress={() => { setArchiveView(value => !value); setSearch(''); }} />} />
    <View style={{ marginBottom: 20 }}><Field label="Find a conversation" placeholder="Search by patient name" value={search} onChangeText={setSearch} /></View>
    {inbox.error ? <Notice message={inbox.error} onRetry={() => void inbox.refresh()} /> : null}
    {error ? <Notice message={error} /> : null}
    {undo && <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}><Text accessibilityLiveRegion="polite" style={{ flex: 1, fontSize: 13 }}>Conversation archived.</Text><Button secondary title="Undo" busy={pending.has(undo.id)} onPress={() => run(undo, false)} /></Card>}
    {inbox.loading ? <ActivityIndicator accessibilityLabel="Loading conversations" color={colors.teal} /> : null}
    <View style={{ gap: 12 }}>{conversations.map(item => <SwipeableConversation key={item.id} restore={archiveView} disabled={pending.has(item.id)} onAction={() => changeArchive(item, !archiveView)}>{suppressPress =>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}${item.unread ? `, ${item.unread} unread` : ''}`} accessibilityHint={archiveView ? 'Opens the archived conversation' : 'Opens the conversation. Swipe left or right to archive.'}
          accessibilityActions={[{ name: archiveView ? 'restore' : 'archive', label: archiveView ? 'Move to inbox' : 'Archive conversation' }]}
          onAccessibilityAction={event => { if (['archive', 'restore'].includes(event.nativeEvent.actionName)) run(item, !archiveView); }}
          disabled={pending.has(item.id)} onPress={() => { if (!suppressPress()) router.push({ pathname: '/conversation/[profileId]', params: { profileId: item.id } }); }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <Avatar name={item.name} /><View style={{ flex: 1, gap: 5 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Text weight="semibold" style={{ flexShrink: 1 }}>{item.name}</Text>{item.starred && <Star size={14} color={colors.accent} fill={colors.accent} />}</View><Text numberOfLines={2} style={{ fontSize: 12, color: colors.muted }}>{item.preview}</Text>{item.lastMessageAt && <Text style={{ fontSize: 10, color: colors.muted }}>{new Date(item.lastMessageAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text>}</View>
          {item.unread > 0 && <View style={{ borderRadius: 10, minWidth: 25, padding: 4, backgroundColor: colors.accent }}><Text weight="bold" style={{ color: colors.onAccent, fontSize: 11, textAlign: 'center' }}>{item.unread > 99 ? '99+' : item.unread}</Text></View>}<ChevronRight size={16} color={colors.teal} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${archiveView ? 'Move to inbox' : 'Archive conversation'}: ${item.name}`} disabled={pending.has(item.id)} onPress={() => run(item, !archiveView)} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }}>
          {pending.has(item.id) ? <ActivityIndicator color={colors.teal} /> : archiveView ? <ArchiveRestore color={colors.teal} size={20} /> : <Archive color={colors.teal} size={20} />}
        </Pressable>
      </Card>
    }</SwipeableConversation>)}</View>
    {!inbox.loading && !inbox.error && !conversations.length && <Empty title={search ? 'No conversations found' : archiveView ? 'No archived conversations' : 'Room for a conversation'} detail={search ? 'Try searching for another patient.' : archiveView ? 'Conversations you archive will appear here.' : 'Conversations appear for your existing patient relationships.'} />}
  </Screen>;
}
