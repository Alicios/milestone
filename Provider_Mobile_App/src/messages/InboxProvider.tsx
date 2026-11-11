import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Conversation } from '../types';
import { useSession } from '../auth/SessionProvider';
import { api } from '../lib/client';
import { friendlyError } from '../lib/domain';
import { supabase } from '../lib/supabase';

type Inbox = { conversations: Conversation[]; loading: boolean; error: string; refresh(): Promise<void>; drafts: React.MutableRefObject<Map<string, string>> };
const Context = createContext<Inbox | null>(null);
export function InboxProvider({ children }: { children: ReactNode }) {
  const { provider } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const drafts = useRef(new Map<string, string>());
  const active = useRef(true);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const result = await api.conversations();
      if (active.current && request === generation.current) { setConversations(result); setError(''); }
    } catch (cause) { if (active.current && request === generation.current) setError(friendlyError(cause)); }
    finally { if (active.current && request === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    active.current = true; void refresh();
    const channel = supabase.channel(`provider-inbox-${provider!.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => void refresh())
      .subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15000);
    return () => { active.current = false; ++generation.current; clearInterval(timer); drafts.current.clear(); void supabase.removeChannel(channel); };
  }, [provider!.id, refresh]);
  return <Context.Provider value={{ conversations, loading, error, refresh, drafts }}>{children}</Context.Provider>;
}
export function useInbox() { const value = useContext(Context); if (!value) throw new Error('InboxProvider is missing'); return value; }
