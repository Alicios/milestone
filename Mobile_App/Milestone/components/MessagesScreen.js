import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Text from './AppText';
import Brand from './Brand';
import ProfileAvatar from './ProfileAvatar';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import { useAppTheme, useThemedStyles } from './AppTheme';
import useAdaptiveLayout from './useAdaptiveLayout';
import { choosePatientMessageImage } from '../lib/messages';

function time(value) { return value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }

function ProviderAvatar({ provider }) {
  return <ProfileAvatar profile={{ fullName: provider.name, preferredName: provider.name, photoUri: provider.avatarUrl }} size={40} />;
}

export default function MessagesScreen({ messaging, dock }) {
  const { conversations, selected, messages, loading, error, sending, refresh, select, send, sendImage } = messaging;
  const styles = useThemedStyles(baseStyles);
  const { colors } = useAppTheme();
  const { isWide, isShort } = useAdaptiveLayout();
  const [drafts, setDrafts] = useState({});
  const [image, setImage] = useState(null);
  const [imageError, setImageError] = useState('');
  const [choosingProvider, setChoosingProvider] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const [webKeyboardInset, setWebKeyboardInset] = useState(0);
  const [workspaceHeight, setWorkspaceHeight] = useState(null);
  const history = useRef(null);
  const composer = useRef(null);
  const focusComposer = useRef(false);
  const draft = drafts[selected?.id] || '';

  useEffect(() => {
    const show = () => setKeyboardVisible(true);
    const hide = () => setKeyboardVisible(false);
    const subscriptions = [
      Keyboard.addListener('keyboardDidShow', show),
      Keyboard.addListener('keyboardDidHide', hide),
    ];
    if (Platform.OS === 'ios') {
      subscriptions.push(Keyboard.addListener('keyboardWillShow', show), Keyboard.addListener('keyboardWillHide', hide));
    }
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !window.visualViewport) return undefined;
    const viewport = window.visualViewport;
    let frame;
    function update() {
      const typing = document.activeElement === composer.current;
      const inset = typing ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      setWebKeyboardInset(inset);
      setKeyboardVisible(inset > 0);
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
    };
  }, []);

  useEffect(() => {
    if (selected?.id && focusComposer.current) {
      composer.current?.focus();
      focusComposer.current = false;
    }
  }, [selected?.id]);

  function startCompose() {
    setImage(null);
    select(null);
    setChoosingProvider(true);
  }

  function chooseProvider(id) {
    setImage(null);
    focusComposer.current = true;
    setChoosingProvider(false);
    select(id);
  }

  async function submit() {
    const id = selected.id;
    const text = draft;
    if (await (image ? sendImage(image, text) : send(text))) {
      setDrafts(current => current[id] === text ? { ...current, [id]: '' } : current);
      setImage(null);
    }
  }
  async function pickImage() {
    try { const asset = await choosePatientMessageImage(); if (asset) { setImage(asset); setImageError(''); } }
    catch (failure) { setImageError(failure.message || 'Could not select image.'); }
  }
  const showInbox = isWide || (!selected && !choosingProvider);
  const showDetail = isWide || selected || choosingProvider;
  const compactHeader = isShort || keyboardVisible;
  const composerMaxHeight = workspaceHeight == null ? 140 : Math.max(48, Math.min(140, workspaceHeight * 0.3));

  // Keep keyboard coordinates relative to the full screen. Safe-area padding
  // and the dock belong inside this view so neither can obscure the composer.
  // Padding only compensates for remaining overlap after Android adjustResize.
  return <KeyboardAvoidingView testID="messages-keyboard-avoider" style={[styles.fill, { backgroundColor: colors.background, paddingBottom: webKeyboardInset }]} behavior="padding">
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.fill}>
    <View onLayout={event => setWorkspaceHeight(event.nativeEvent.layout.height)} style={[styles.workspace, isWide && styles.workspaceWide]}>
    <View style={[styles.header, compactHeader && styles.headerShort, keyboardVisible && selected && !choosingProvider && styles.hidden]}>
      {!compactHeader && <Brand />}
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={styles.title}>Messages</Text>
        {!choosingProvider && <Pressable accessibilityRole="button" accessibilityLabel="Compose message" accessibilityState={{ disabled: loading || sending || !conversations.length }} disabled={loading || sending || !conversations.length} onPress={startCompose} style={[styles.composeButton, (loading || sending || !conversations.length) && styles.disabled]}><Text style={styles.sendText}>Compose</Text></Pressable>}
      </View>
    </View>
    {error ? <View style={styles.notice}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry messages" onPress={refresh} style={styles.action}><Text style={styles.link}>Retry</Text></Pressable></View> : null}
    <View testID="messages-panes" style={[styles.fill, isWide && styles.panes]}>
    <View testID="conversation-list" style={[styles.fill, isWide && styles.inboxPane, !showInbox && styles.hidden]} accessibilityElementsHidden={!showInbox} importantForAccessibility={showInbox ? 'auto' : 'no-hide-descendants'}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.history} refreshControl={<RefreshControl refreshing={loading && Boolean(conversations.length)} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}>
        {loading && !conversations.length ? <ActivityIndicator accessibilityLabel="Loading messages" color={colors.primary} /> : !conversations.length && !error ? <Text style={styles.muted}>No care team conversations yet. Your linked providers will appear here.</Text> : conversations.map(row => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`Conversation with ${row.name}${row.unread ? `, ${row.unread} unread` : ''}`} accessibilityState={{ selected: selected?.id === row.id }} onPress={() => { setImage(null); setChoosingProvider(false); select(row.id); }} style={[styles.row, selected?.id === row.id && styles.selectedRow]}><ProviderAvatar provider={row} /><View style={styles.fill}><Text style={styles.name}>{row.name}</Text><Text style={styles.muted} numberOfLines={2}>{row.preview}</Text><Text style={styles.timestamp}>{time(row.lastMessageAt)}</Text></View>{row.unread > 0 ? <Text style={styles.badge}>{row.unread}</Text> : null}</Pressable>)}
      </ScrollView>
    </View>
    <View testID="conversation-detail" style={[styles.fill, isWide && styles.detailPane, !showDetail && styles.hidden]} accessibilityElementsHidden={!showDetail} importantForAccessibility={showDetail ? 'auto' : 'no-hide-descendants'}>
    {choosingProvider ? <>
      <View style={styles.threadHeader}>
        <View style={styles.fill}><Text accessibilityRole="header" style={styles.name}>New message</Text><Text style={styles.muted}>Choose one of your assigned providers.</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel new message" onPress={() => setChoosingProvider(false)} style={styles.action}><Text style={styles.link}>Cancel</Text></Pressable>
      </View>
      <ScrollView style={styles.fill} contentContainerStyle={styles.history} keyboardShouldPersistTaps="handled">
        {loading ? <ActivityIndicator accessibilityLabel="Loading providers" color={colors.primary} /> : !conversations.length ? <Text style={styles.muted}>No assigned providers are available. Contact your care team.</Text> : [...conversations].sort((a, b) => a.name.localeCompare(b.name)).map(row => (
          <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`Message ${row.name}`} onPress={() => chooseProvider(row.id)} style={styles.row}>
            <ProviderAvatar provider={row} />
            <View style={styles.fill}><Text style={styles.name}>{row.name}</Text>{row.title ? <Text style={styles.muted}>{row.title}</Text> : null}</View>
            <Text style={styles.link}>Message</Text>
          </Pressable>
        ))}
      </ScrollView>
    </> : selected ? <>
      <View style={styles.threadHeader}><Pressable accessibilityRole="button" accessibilityLabel="Back to conversations" onPress={() => select(null)} style={styles.backButton}><ArrowLeft accessible={false} size={24} color={colors.primary} /></Pressable><ProviderAvatar provider={selected} /><View style={styles.fill}><Text accessibilityRole="header" style={styles.name}>{selected.name}</Text>{selected.title ? <Text style={styles.muted}>{selected.title}</Text> : null}</View></View>
      <ScrollView ref={history} style={styles.fill} contentContainerStyle={styles.history} onContentSizeChange={() => history.current?.scrollToEnd({ animated: false })} onLayout={() => history.current?.scrollToEnd({ animated: false })} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {loading ? <ActivityIndicator accessibilityLabel="Loading conversation" color={colors.primary} /> : messages.length === 0 ? <Text style={styles.muted}>No messages yet. Send your provider a message below.</Text> : messages.map(message => <View key={message.id} style={[styles.bubble, message.sender_kind === 'patient' ? styles.outgoing : styles.incoming]}>{message.image_path && (message.image_url ? <Image accessibilityLabel="Message image" source={{ uri: message.image_url }} resizeMode="contain" style={styles.messageImage} /> : <Text style={styles.muted}>Image unavailable</Text>)}{message.body ? <Text style={styles.body}>{message.body}</Text> : null}<Text style={styles.timestamp}>{message.sender_kind === 'patient' ? 'You' : selected.name} · {time(message.created_at)}</Text></View>)}
      </ScrollView>
      {imageError ? <Text accessibilityRole="alert" style={styles.error}>{imageError}</Text> : null}
      {image && <View style={styles.attachment}><Image source={{ uri: image.uri }} style={styles.thumbnail} /><Text style={styles.muted}>Image ready</Text><Pressable accessibilityRole="button" accessibilityLabel="Remove image" onPress={() => setImage(null)} style={styles.action}><Text style={styles.link}>Remove</Text></Pressable></View>}
      <View style={styles.composer}><Pressable accessibilityRole="button" accessibilityLabel="Attach image" disabled={sending} onPress={pickImage} style={styles.action}><Text style={styles.link}>Image</Text></Pressable><TextInput ref={composer} accessibilityLabel="Message to provider" placeholder="Write a message..." placeholderTextColor={colors.muted} multiline maxLength={8000} value={draft} onChangeText={value => setDrafts(current => ({ ...current, [selected.id]: value }))} style={[styles.input, { maxHeight: composerMaxHeight }]} /><Pressable accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: sending || (!draft.trim() && !image) || [...draft.trim()].length > 4000, busy: sending }} disabled={sending || (!draft.trim() && !image) || [...draft.trim()].length > 4000} onPress={submit} style={[styles.send, (sending || (!draft.trim() && !image) || [...draft.trim()].length > 4000) && styles.disabled]}><Text style={styles.sendText}>{sending ? 'Sending...' : 'Send'}</Text></Pressable></View>
      <Text style={styles.counter}>{[...draft.trim()].length}/4000</Text>
    </> : <View style={styles.placeholder}><Text style={styles.muted}>Select a conversation or compose a message to your care team.</Text></View>}
    </View>
    </View>
    </View>
    {!keyboardVisible && dock}
    </SafeAreaView>
  </KeyboardAvoidingView>;
}

const baseStyles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0, minHeight: 0 },
  workspace: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', minHeight: 0 },
  workspaceWide: { maxWidth: 1200 },
  panes: { flexDirection: 'row' },
  inboxPane: { flex: 0.38, borderRightWidth: 1, borderColor: '#B7CAC2' },
  detailPane: { flex: 0.62 },
  hidden: { display: 'none' },
  selectedRow: { backgroundColor: '#9BCBC5', borderColor: '#357F83' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { paddingHorizontal: 24, paddingTop: 16, gap: 16 },
  headerShort: { paddingTop: 4, gap: 4 },
  title: { color: '#193333', fontSize: 28, fontWeight: '800', flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  composeButton: { backgroundColor: '#193333', borderRadius: 14, minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  backButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notice: { paddingHorizontal: 24 }, error: { color: '#A83E14', lineHeight: 20 }, action: { minHeight: 44, padding: 10, justifyContent: 'center' }, link: { color: '#357F83', fontWeight: '700' },
  threadHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#B7CAC2' },
  name: { color: '#193333', fontSize: 16, fontWeight: '700' }, muted: { color: '#357F83', lineHeight: 22 }, history: { padding: 20, gap: 12, flexGrow: 1 },
  row: { backgroundColor: '#FFFDF7', borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#B7CAC2' },
  badge: { color: '#FFFDF7', backgroundColor: '#193333', padding: 8, borderRadius: 16, overflow: 'hidden', fontWeight: '700' },
  bubble: { maxWidth: '90%', borderRadius: 16, padding: 14 }, outgoing: { alignSelf: 'flex-end', backgroundColor: '#9BCBC5' }, incoming: { alignSelf: 'flex-start', backgroundColor: '#FFFDF7' },
  messageImage: { width: 240, height: 240, maxWidth: '100%', marginBottom: 6 },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }, thumbnail: { width: 48, height: 48, borderRadius: 6 },
  body: { color: '#193333', fontSize: 16, lineHeight: 23 }, timestamp: { color: '#357F83', fontSize: 11, marginTop: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  input: { flex: 1, minHeight: 48, maxHeight: 140, borderWidth: 1, borderColor: '#B7CAC2', borderRadius: 14, color: '#193333', backgroundColor: '#FFFDF7', padding: 12, fontSize: 16 },
  send: { backgroundColor: '#193333', borderRadius: 14, minHeight: 48, padding: 14, justifyContent: 'center' }, sendText: { color: '#FFFDF7', fontWeight: '700' }, counter: { color: '#357F83', fontSize: 11, paddingHorizontal: 20, paddingVertical: 4, textAlign: 'right' },
});
