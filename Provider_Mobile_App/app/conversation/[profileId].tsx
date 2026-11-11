import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Send, Star } from 'lucide-react-native';
import { router } from 'expo-router';
import { useSession } from '../../src/auth/SessionProvider';
import { useResource } from '../../src/hooks/useResource';
import { api } from '../../src/lib/client';
import { friendlyError } from '../../src/lib/domain';
import { supabase } from '../../src/lib/supabase';
import { useInbox } from '../../src/messages/InboxProvider';
import { Button, Empty, Field, Heading, Notice, Text } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function ConversationScreen() {
  const { profileId: parameter } = useLocalSearchParams<{ profileId: string }>();
  const profileId = Array.isArray(parameter) ? parameter[0] : parameter;
  const { provider } = useSession();
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const compact = height < 500 || keyboardVisible;
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const inbox = useInbox();
  const conversation = inbox.conversations.find(item => item.id === profileId);
  const resource = useResource(`messages-${provider!.id}-${profileId}`, () => api.messages(profileId), 15000);
  const [draft, setDraft] = useState(inbox.drafts.current.get(profileId) ?? '');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [starring, setStarring] = useState(false);
  const [focused, setFocused] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const bottom = useRef(true);
  const markedThrough = useRef('');
  useEffect(() => { mounted.current = true; setDraft(inbox.drafts.current.get(profileId) ?? ''); return () => { mounted.current = false; }; }, [profileId]);
  useFocusEffect(useCallback(() => { setFocused(true); void inbox.refresh(); return () => setFocused(false); }, [inbox.refresh]));
  useEffect(() => {
    if (!focused) return;
    const channel = supabase.channel(`provider-thread-${profileId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `patient_profile_id=eq.${profileId}` }, () => void resource.refresh())
      .subscribe(status => { if (status === 'SUBSCRIBED') void resource.refresh(); });
    return () => { void supabase.removeChannel(channel); };
  }, [profileId, focused, resource.refresh]);
  const latest = resource.data?.at(-1)?.createdAt;
  useEffect(() => {
    if (!focused || !atBottom || !latest || latest <= markedThrough.current || !conversation) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      void api.markRead(profileId, provider!.id, latest).then(() => {
        if (!cancelled) { markedThrough.current = latest; void inbox.refresh(); }
      }).catch(() => { if (!cancelled) setError('Read status could not be updated. Pull down to retry.'); });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [latest, focused, atBottom, profileId, provider!.id, conversation?.id, resource.data]);
  async function send() {
    if (inFlight.current || !conversation) return;
    inFlight.current = true; setSending(true); setError('');
    const text = draft;
    try {
      await api.send(profileId, text);
      if (!mounted.current) return;
      setDraft(''); inbox.drafts.current.delete(profileId); bottom.current = true; setAtBottom(true);
      await Promise.all([resource.refresh(), inbox.refresh()]);
    } catch (cause) { if (mounted.current) setError(friendlyError(cause)); }
    finally { inFlight.current = false; if (mounted.current) setSending(false); }
  }
  async function toggleStar() {
    if (!conversation || starring) return;
    setStarring(true); setError('');
    try { await api.star(profileId, provider!.id, !conversation.starred); await inbox.refresh(); }
    catch (cause) { if (mounted.current) setError(friendlyError(cause)); }
    finally { if (mounted.current) setStarring(false); }
  }
  return <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: colors.bg }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: compact ? 12 : 22, paddingTop: compact ? 0 : 8, maxWidth: 1000, width: '100%', alignSelf: 'center' }}>
      {compact ? <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 10 }}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/messages')} style={{ padding: 12 }}><ArrowLeft color={colors.teal} size={20} /></Pressable><Text accessibilityRole="header" weight="bold" style={{ fontSize: 18, flex: 1 }}>{conversation?.name ?? 'Messages'}</Text>{conversation && <Pressable disabled={starring} accessibilityRole="button" accessibilityLabel={conversation.starred ? 'Unstar conversation' : 'Star conversation'} onPress={() => void toggleStar()} style={{ padding: 12 }}><Star size={20} color={colors.accent} fill={conversation.starred ? colors.accent : 'transparent'} /></Pressable>}</View>
        : <Heading back eyebrow="Conversation" title={conversation?.name ?? 'Messages'} action={conversation ? <Pressable disabled={starring} accessibilityRole="button" accessibilityLabel={conversation.starred ? 'Unstar conversation' : 'Star conversation'} accessibilityState={{ selected: conversation.starred, disabled: starring }} onPress={() => void toggleStar()} style={{ padding: 12 }}><Star size={22} color={colors.accent} fill={conversation.starred ? colors.accent : 'transparent'} /></Pressable> : undefined} />}
    </View>
    <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, width: '100%', maxWidth: 1000, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 20, gap: 12 }}
      refreshControl={<RefreshControl refreshing={resource.loading && Boolean(resource.data)} onRefresh={() => { setError(''); void resource.refresh(); void inbox.refresh(); }} tintColor={colors.teal} />}
      onContentSizeChange={() => { if (bottom.current) scroll.current?.scrollToEnd({ animated: false }); }}
      onScroll={event => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; const near = contentOffset.y + layoutMeasurement.height >= contentSize.height - 45; bottom.current = near; setAtBottom(near); }} scrollEventThrottle={100}>
      {resource.error ? <Notice message={resource.error} onRetry={() => void resource.refresh()} /> : null}
      {inbox.error ? <Notice message={inbox.error} onRetry={() => void inbox.refresh()} /> : null}
      {resource.loading && !resource.data && <ActivityIndicator accessibilityLabel="Loading messages" color={colors.teal} />}
      {!inbox.loading && !inbox.error && !conversation && <Empty title="Conversation unavailable" detail="This care relationship is not accessible. Return to Messages and refresh your inbox." />}
      {conversation && !resource.loading && !resource.error && resource.data?.length === 0 && <Empty title="Start with a hello" detail="Your messages will appear here and in your patient's Milestone app." />}
      {conversation && resource.data?.map(message => <View key={message.id} style={{ alignSelf: message.from === 'provider' ? 'flex-end' : 'flex-start', maxWidth: '88%', borderRadius: 18, borderBottomRightRadius: message.from === 'provider' ? 5 : 18, borderBottomLeftRadius: message.from === 'patient' ? 5 : 18, padding: 15, gap: 5, backgroundColor: message.from === 'provider' ? colors.soft : colors.surface, borderColor: colors.border, borderWidth: 1 }}><Text weight="semibold" style={{ color: colors.teal, fontSize: 10 }}>{message.from === 'provider' ? 'You' : conversation.name}</Text><Text selectable>{message.text}</Text><Text style={{ fontSize: 10, lineHeight: 16, color: colors.muted }}>{new Date(message.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text></View>)}
    </ScrollView>
    <View style={{ width: '100%', maxWidth: 1000, alignSelf: 'center', padding: compact ? 10 : 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
      {error ? <Notice message={error} /> : null}
      <Field hideLabel={compact} label="Message" placeholder="Write a thoughtful check-in…" multiline value={draft} editable={!sending && Boolean(conversation)} onChangeText={value => { setDraft(value); inbox.drafts.current.set(profileId, value); }} style={{ minHeight: compact ? 44 : 55, maxHeight: compact ? 70 : 120, textAlignVertical: 'top' }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><Text style={{ color: [...draft.trim()].length > 4000 ? colors.error : colors.muted, fontSize: 11 }}>{[...draft.trim()].length.toLocaleString()}/4,000</Text><Button title="Send message" icon={<Send size={17} color={colors.onAccent} />} busy={sending} disabled={!conversation || !draft.trim() || [...draft.trim()].length > 4000} onPress={() => void send()} /></View>
    </View>
  </KeyboardAvoidingView></SafeAreaView>;
}
