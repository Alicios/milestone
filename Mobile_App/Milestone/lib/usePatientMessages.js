import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';
import { loadPatientConversations, loadPatientMessages, markPatientMessagesRead, sendPatientMessage } from './messages';

export default function usePatientMessages({ enabled, patientId, visible }) {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && (Platform.OS !== 'web' || document.visibilityState !== 'hidden'));
  const generation = useRef(0);
  const pendingSend = useRef(false);
  const readKey = useRef('');
  const selected = conversations.find(row => row.id === selectedId);

  const refresh = useCallback(async () => {
    if (!enabled || !patientId || !foreground) return;
    const request = ++generation.current;
    try {
      const rows = await loadPatientConversations();
      const history = visible && selectedId ? await loadPatientMessages(selectedId) : [];
      if (request !== generation.current) return;
      setConversations(rows);
      if (selectedId && !rows.some(row => row.id === selectedId)) setSelectedId(null);
      setMessages(history);
      setError('');
    } catch (failure) {
      if (request === generation.current) setError(failure.message || 'Messages could not be loaded. Try again.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [enabled, patientId, selectedId, visible, foreground]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    const onVisible = () => setForeground(document.visibilityState !== 'hidden');
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisible);
    return () => {
      subscription.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    setConversations([]); setMessages([]); setSelectedId(null); readKey.current = '';
  }, [patientId]);

  useEffect(() => {
    generation.current += 1;
    if (!enabled || !patientId || !foreground) return;
    setLoading(true);
    void refresh();
    const channel = supabase.channel(`patient-messages-${patientId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => { void refresh(); })
      .subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
    // Reconcile missed events and work when a network blocks WebSockets.
    const timer = setInterval(() => { void refresh(); }, 15000);
    return () => {
      generation.current += 1; clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, patientId, foreground, refresh]);

  useEffect(() => {
    const latest = messages.at(-1);
    if (!enabled || !foreground || !visible || !selected?.unread || !latest || loading) return;
    const key = `${selected.id}:${latest.id}`;
    if (readKey.current === key) return;
    readKey.current = key;
    let active = true;
    markPatientMessagesRead(selected.id, latest.id).then(() => { if (active) void refresh(); }).catch(failure => {
      if (active) { readKey.current = ''; setError(failure.message || 'Unable to mark messages as read.'); }
    });
    return () => { active = false; };
  }, [enabled, foreground, visible, selected, messages, loading, refresh]);

  async function send(body) {
    if (!enabled || !selectedId || pendingSend.current) return false;
    pendingSend.current = true; setSending(true); setError('');
    try {
      await sendPatientMessage(selectedId, body);
      await refresh();
      return true;
    } catch (failure) {
      setError(failure.message || 'Message could not be sent. Your draft is still here.');
      return false;
    } finally { pendingSend.current = false; setSending(false); }
  }

  function select(id) {
    if (id === selectedId) return;
    generation.current += 1; setMessages([]); setLoading(true); setSelectedId(id);
  }
  return { conversations, selected, messages, loading, error, sending, refresh, select, send,
    unread: conversations.reduce((total, row) => total + row.unread, 0) };
}
