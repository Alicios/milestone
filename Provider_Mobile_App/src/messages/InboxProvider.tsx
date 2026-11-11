import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Conversation } from '../types';
import { useSession } from '../auth/SessionProvider';
import { api } from '../lib/client';
import { friendlyError } from '../lib/domain';
import { archiveCursor, isConversationArchived } from '../lib/conversationArchive';
import { supabase } from '../lib/supabase';

type Inbox = { conversations: Conversation[]; loading: boolean; error: string; refresh(): Promise<void>;
  setArchived(conversation: Conversation, archived: boolean): Promise<void>;
  drafts: React.MutableRefObject<Map<string, string>> };
const Context = createContext<Inbox | null>(null);
export function InboxProvider({ children }: { children: ReactNode }) {
  const { provider } = useSession();
  const providerId = provider!.id;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const drafts = useRef(new Map<string, string>());
  const active = useRef(true);
  const generation = useRef(0);
  const mutations = useRef(new Map<string, Promise<void>>());
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const result = await api.conversations(providerId);
      if (active.current && request === generation.current) { setConversations(result); setError(''); }
    } catch (cause) { if (active.current && request === generation.current) setError(friendlyError(cause)); }
    finally { if (active.current && request === generation.current) setLoading(false); }
  }, [providerId]);
  const setArchived = useCallback((conversation: Conversation, archived: boolean): Promise<void> => {
    const pending = mutations.current.get(conversation.id);
    if (pending) return pending;
    const cursor = archived ? archiveCursor(conversation.lastMessageAt) : null;
    const operation = Promise.resolve().then(async () => {
      const saved = await api.archiveConversation(conversation.id, providerId, cursor);
      if (!active.current) return;
      ++generation.current; // Older polling responses cannot resurrect the old archive state.
      setConversations(rows => rows.map(row => row.id === conversation.id ? {
        ...row, archivedThroughAt: saved, archived: isConversationArchived(row.lastMessageAt, saved),
      } : row));
      void refresh();
    }).finally(() => { mutations.current.delete(conversation.id); });
    mutations.current.set(conversation.id, operation);
    return operation;
  }, [providerId, refresh]);
  useEffect(() => {
    active.current = true; void refresh();
    const channel = supabase.channel(`provider-inbox-${providerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => void refresh())
      .subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15000);
    return () => { active.current = false; ++generation.current; clearInterval(timer); drafts.current.clear(); void supabase.removeChannel(channel); };
  }, [providerId, refresh]);
  return <Context.Provider value={{ conversations, loading, error, refresh, setArchived, drafts }}>{children}</Context.Provider>;
}
export function useInbox() { const value = useContext(Context); if (!value) throw new Error('InboxProvider is missing'); return value; }
