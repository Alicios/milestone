import React, { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, Platform, View, type ViewStyle } from 'react-native';
import { Archive, ArchiveRestore } from 'lucide-react-native';
import { shouldCommitConversationSwipe, shouldStartConversationSwipe } from '../lib/conversationArchive';
import { Text } from '../ui/components';
import { useTheme } from '../ui/theme';

export function SwipeableConversation({ children, restore, disabled, onAction }: { children: (suppressPress: () => boolean) => ReactNode; restore: boolean; disabled: boolean; onAction(): Promise<void> }) {
  const { colors } = useTheme();
  const translation = useRef(new Animated.Value(0)).current;
  const width = useRef(300);
  const suppress = useRef(false);
  const mounted = useRef(true);
  const busy = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ disabled, onAction }); latest.current = { disabled, onAction };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; translation.stopAnimation(); if (resetTimer.current) clearTimeout(resetTimer.current); };
  }, [translation]);
  const responder = useMemo(() => {
    const reset = () => {
      if (!mounted.current) return;
      Animated.spring(translation, { toValue: 0, useNativeDriver: true, tension: 90, friction: 12 }).start();
      busy.current = false;
      resetTimer.current = setTimeout(() => { suppress.current = false; }, 250);
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) => !busy.current && !latest.current.disabled && shouldStartConversationSwipe(gesture.dx, gesture.dy),
      onPanResponderGrant: () => { suppress.current = true; translation.stopAnimation(); },
      onPanResponderMove: (_, gesture) => { translation.setValue(Math.max(-width.current, Math.min(width.current, gesture.dx))); },
      onPanResponderRelease: (_, gesture) => {
        if (!shouldCommitConversationSwipe(gesture.dx, gesture.vx, width.current)) { reset(); return; }
        busy.current = true;
        Animated.timing(translation, { toValue: Math.sign(gesture.dx) * width.current, duration: 150, useNativeDriver: true }).start(({ finished }) => {
          if (!finished || !mounted.current) return;
          void latest.current.onAction().then(reset, reset);
        });
      },
      onPanResponderTerminate: reset,
      onPanResponderTerminationRequest: () => false,
    });
  }, [translation]);
  const Icon = restore ? ArchiveRestore : Archive;
  const opacity = translation.interpolate({ inputRange: [-60, -12, 0, 12, 60], outputRange: [1, 0, 0, 0, 1], extrapolate: 'clamp' });
  return <View onLayout={event => { width.current = event.nativeEvent.layout.width; }} style={[{ borderRadius: 20, overflow: 'hidden' }, Platform.OS === 'web' ? ({ touchAction: 'pan-y', overscrollBehaviorX: 'contain' } as unknown as ViewStyle) : undefined]}>
    <Animated.View pointerEvents="none" aria-hidden={true} importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', inset: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, backgroundColor: colors.teal, opacity }}>
      {[0, 1].map(side => <View key={side} style={{ alignItems: 'center', gap: 5 }}><Icon size={23} color={colors.bg} /><Text weight="semibold" style={{ color: colors.bg, fontSize: 10 }}>{restore ? 'Move to inbox' : 'Archive'}</Text></View>)}
    </Animated.View>
    <Animated.View {...responder.panHandlers} style={{ transform: [{ translateX: translation }] }}>{children(() => suppress.current || busy.current)}</Animated.View>
  </View>;
}
