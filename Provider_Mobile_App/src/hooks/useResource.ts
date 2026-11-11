import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { friendlyError } from '../lib/domain';

export function useResource<T>(key: string, loader: () => Promise<T>, interval?: number) {
  const load = useRef(loader); load.current = loader;
  const generation = useRef(0);
  const active = useRef(false);
  const [state, setState] = useState<{ key: string; data?: T; loading: boolean; error: string }>({ key, loading: true, error: '' });
  const refresh = useCallback(async () => {
    if (!active.current) return;
    const request = ++generation.current;
    setState(old => ({ ...old, loading: true }));
    try {
      const data = await load.current();
      if (active.current && request === generation.current) setState({ key, data, loading: false, error: '' });
    } catch (cause) {
      if (active.current && request === generation.current) setState(old => ({ ...old, key, loading: false, error: friendlyError(cause) }));
    }
  }, [key]);
  useFocusEffect(useCallback(() => {
    active.current = true;
    setState(old => old.key === key ? old : { key, loading: true, error: '' });
    void refresh();
    const listener = AppState.addEventListener('change', next => { if (next === 'active') void refresh(); });
    const timer = interval ? setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, interval) : undefined;
    return () => { active.current = false; ++generation.current; listener.remove(); if (timer) clearInterval(timer); };
  }, [key, interval, refresh]));
  return { data: state.key === key ? state.data : undefined, loading: state.key !== key || state.loading, error: state.key === key ? state.error : '', refresh };
}
