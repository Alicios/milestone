import React, { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Text from './AppText';
import Brand from './Brand';
import { useAppTheme, useThemedStyles } from './AppTheme';

function time(value) { return value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }

export default function MessagesScreen({ messaging }) {
  const { conversations, selected, messages, loading, error, sending, refresh, select, send } = messaging;
  const styles = useThemedStyles(baseStyles);
  const { colors } = useAppTheme();
  const [drafts, setDrafts] = useState({});
  const history = useRef(null);
  const draft = drafts[selected?.id] || '';
  async function submit() {
    const id = selected.id;
    const text = draft;
    if (await send(text)) setDrafts(current => current[id] === text ? { ...current, [id]: '' } : current);
  }
  return <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><Brand /><Text accessibilityRole="header" style={styles.title}>Messages</Text></View>
    {error ? <View style={styles.notice}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry messages" onPress={refresh} style={styles.action}><Text style={styles.link}>Retry</Text></Pressable></View> : null}
    {selected ? <>
      <View style={styles.threadHeader}><Pressable accessibilityRole="button" accessibilityLabel="Back to conversations" onPress={() => select(null)} style={styles.action}><Text style={styles.link}>Back</Text></Pressable><View style={styles.fill}><Text accessibilityRole="header" style={styles.name}>{selected.name}</Text>{selected.title ? <Text style={styles.muted}>{selected.title}</Text> : null}</View></View>
      <ScrollView ref={history} style={styles.fill} contentContainerStyle={styles.history} onContentSizeChange={() => history.current?.scrollToEnd({ animated: false })} keyboardShouldPersistTaps="handled">
        {loading ? <ActivityIndicator accessibilityLabel="Loading conversation" color={colors.primary} /> : messages.length === 0 ? <Text style={styles.muted}>No messages yet. Send your provider a message below.</Text> : messages.map(message => <View key={message.id} style={[styles.bubble, message.sender_kind === 'patient' ? styles.outgoing : styles.incoming]}><Text style={styles.body}>{message.body}</Text><Text style={styles.timestamp}>{message.sender_kind === 'patient' ? 'You' : selected.name} · {time(message.created_at)}</Text></View>)}
      </ScrollView>
      <View style={styles.composer}><TextInput accessibilityLabel="Message to provider" placeholder="Write a message..." placeholderTextColor={colors.muted} multiline maxLength={8000} value={draft} onChangeText={value => setDrafts(current => ({ ...current, [selected.id]: value }))} style={styles.input} /><Pressable accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: sending || !draft.trim() || [...draft.trim()].length > 4000, busy: sending }} disabled={sending || !draft.trim() || [...draft.trim()].length > 4000} onPress={submit} style={[styles.send, (sending || !draft.trim() || [...draft.trim()].length > 4000) && { opacity: 0.5 }]}><Text style={styles.sendText}>{sending ? 'Sending...' : 'Send'}</Text></Pressable></View>
      <Text style={styles.counter}>{[...draft.trim()].length}/4000</Text>
    </> : <ScrollView style={styles.fill} contentContainerStyle={styles.history}>
      {loading ? <ActivityIndicator accessibilityLabel="Loading messages" color={colors.primary} /> : !conversations.length && !error ? <Text style={styles.muted}>No care team conversations yet. Your linked providers will appear here.</Text> : conversations.map(row => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`Conversation with ${row.name}${row.unread ? `, ${row.unread} unread` : ''}`} onPress={() => select(row.id)} style={styles.row}><View style={styles.fill}><Text style={styles.name}>{row.name}</Text><Text style={styles.muted} numberOfLines={2}>{row.preview}</Text><Text style={styles.timestamp}>{time(row.lastMessageAt)}</Text></View>{row.unread > 0 ? <Text style={styles.badge}>{row.unread}</Text> : null}</Pressable>)}
    </ScrollView>}
  </KeyboardAvoidingView>;
}

const baseStyles = StyleSheet.create({
  fill: { flex: 1 }, header: { paddingHorizontal: 24, paddingTop: 16, gap: 16 }, title: { color: '#193333', fontSize: 28, fontWeight: '800' },
  notice: { paddingHorizontal: 24 }, error: { color: '#A83E14', lineHeight: 20 }, action: { minHeight: 44, padding: 10, justifyContent: 'center' }, link: { color: '#357F83', fontWeight: '700' },
  threadHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#B7CAC2' },
  name: { color: '#193333', fontSize: 16, fontWeight: '700' }, muted: { color: '#357F83', lineHeight: 22 }, history: { padding: 20, gap: 12, flexGrow: 1 },
  row: { backgroundColor: '#FFFDF7', borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#B7CAC2' },
  badge: { color: '#FFFDF7', backgroundColor: '#193333', padding: 8, borderRadius: 16, overflow: 'hidden', fontWeight: '700' },
  bubble: { maxWidth: '90%', borderRadius: 16, padding: 14 }, outgoing: { alignSelf: 'flex-end', backgroundColor: '#9BCBC5' }, incoming: { alignSelf: 'flex-start', backgroundColor: '#FFFDF7' },
  body: { color: '#193333', fontSize: 16, lineHeight: 23 }, timestamp: { color: '#357F83', fontSize: 11, marginTop: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  input: { flex: 1, minHeight: 48, maxHeight: 140, borderWidth: 1, borderColor: '#B7CAC2', borderRadius: 14, color: '#193333', backgroundColor: '#FFFDF7', padding: 12, fontSize: 16 },
  send: { backgroundColor: '#193333', borderRadius: 14, minHeight: 48, padding: 14, justifyContent: 'center' }, sendText: { color: '#FFFDF7', fontWeight: '700' }, counter: { color: '#357F83', fontSize: 11, paddingHorizontal: 20, paddingVertical: 4, textAlign: 'right' },
});
