import React, { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput, type ScrollViewProps } from 'react-native';
import { useKeyboardLayout } from '../hooks/useKeyboardLayout';

// Place outside safe-area padding so keyboard coordinates share the screen origin.
export function KeyboardLayout({ children }: { children: ReactNode }) {
  const { bottomInset } = useKeyboardLayout();
  // Android can overlay the window even with resize configured (for example,
  // in an existing native build). Reserve any remaining overlap on both OSes.
  return <KeyboardAvoidingView enabled={Platform.OS !== 'web'} behavior="padding" style={{ flex: 1, paddingBottom: bottomInset }}>{children}</KeyboardAvoidingView>;
}

const FocusedField = createContext<(input: React.ComponentRef<typeof TextInput> | null) => void>(() => {});
export const useFocusedField = () => useContext(FocusedField);

export function KeyboardScrollView({ children, onLayout, ...props }: ScrollViewProps) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const focused = useRef<React.ComponentRef<typeof TextInput> | null>(null);
  const frame = useRef<number | null>(null);
  const { bottomInset } = useKeyboardLayout();
  const reveal = useCallback(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const input = focused.current;
      if (!input?.isFocused()) return;
      if (Platform.OS === 'web') {
        (input as unknown as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } else {
        scroll.current?.scrollResponderScrollNativeHandleToKeyboard(input, 16, true);
      }
    });
  }, []);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', reveal);
    return () => { show.remove(); if (frame.current != null) cancelAnimationFrame(frame.current); };
  }, [reveal]);
  useEffect(reveal, [bottomInset, reveal]);
  return <ScrollView {...props} ref={scroll} keyboardShouldPersistTaps="handled" onLayout={event => { onLayout?.(event); reveal(); }}>
    <FocusedField.Provider value={input => { focused.current = input; reveal(); }}>{children}</FocusedField.Provider>
  </ScrollView>;
}
