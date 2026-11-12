import React, { type ReactNode } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Text } from './components';
import { KeyboardLayout, KeyboardScrollView } from './KeyboardLayout';
import { useTheme } from './theme';

export function ActionSheet({ visible, title, onClose, children, footer, dialog = false }: { visible: boolean; title: string; onClose(): void; children: ReactNode; footer?: ReactNode; dialog?: boolean }) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <KeyboardLayout>
    <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: dialog ? 'center' : 'flex-end', paddingHorizontal: dialog ? 12 : 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + (dialog ? 12 : 82) }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss ${title.toLowerCase()}`} onPress={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(10,30,30,0.28)' }} />
      <View accessibilityViewIsModal role={dialog ? 'dialog' : 'menu'} accessibilityLabel={title} style={{ width: Math.min(dialog ? 640 : 350, width - (dialog ? 24 : 32)), flexShrink: 1, maxHeight: dialog ? '100%' : Math.max(150, height - insets.top - insets.bottom - 110), backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: dialog ? 18 : 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: dialog ? 0 : 8, paddingBottom: dialog ? 16 : 8 }}><Text accessibilityRole="header" weight="semibold" style={{ flex: 1, fontSize: dialog ? 22 : 18, lineHeight: dialog ? 30 : 23 }}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Close ${title.toLowerCase()}`} onPress={onClose} style={{ padding: 10, minHeight: 44, minWidth: 44 }}><X size={dialog ? 24 : 20} color={colors.teal} /></Pressable></View>
        <KeyboardScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 4 }}>{children}</KeyboardScrollView>
        {footer}
      </View>
    </View>
    </KeyboardLayout>
  </Modal>;
}
