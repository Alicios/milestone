import React, { type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Text } from './components';
import { useTheme } from './theme';

export function ActionSheet({ visible, title, onClose, children, footer, dialog = false }: { visible: boolean; title: string; onClose(): void; children: ReactNode; footer?: ReactNode; dialog?: boolean }) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'flex-end', paddingHorizontal: 16, paddingBottom: insets.bottom + 82 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss ${title.toLowerCase()}`} onPress={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(10,30,30,0.28)' }} />
      <View accessibilityViewIsModal role={dialog ? 'dialog' : 'menu'} accessibilityLabel={title} style={{ width: Math.min(350, width - 32), maxHeight: Math.max(150, height - insets.top - insets.bottom - 110), backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8, paddingBottom: 8 }}><Text accessibilityRole="header" weight="semibold" style={{ flex: 1, fontSize: 18 }}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Close ${title.toLowerCase()}`} onPress={onClose} style={{ padding: 10, minHeight: 44, minWidth: 44 }}><X size={20} color={colors.teal} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 4 }}>{children}</ScrollView>
        {footer}
      </View>
    </View>
  </Modal>;
}
