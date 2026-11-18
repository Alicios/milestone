import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Text from './AppText';
import { useAppTheme } from './AppTheme';

export default function TutorialScreenshot({ source, caption }) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const { width } = useWindowDimensions();
  const thumbnailWidth = Math.max(100, Math.min(240, width - 100));
  const zoomWidth = Math.max(390, Math.min(width, 600)) * 2;
  const zoomHeight = zoomWidth * 844 / 390;
  return <View style={{ gap: 10 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Enlarge screenshot: ${caption}`} onPress={() => { setZoomed(false); setOpen(true); }} style={{ width: thumbnailWidth, alignSelf: 'center', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
      <Image source={source} accessibilityLabel={caption} resizeMode="contain" style={{ width: thumbnailWidth, height: thumbnailWidth * 844 / 390 }} />
    </Pressable>
    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' }}>{caption} Tap to enlarge.</Text>
    <Modal visible={open} supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']} animationType="fade" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 8 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Pressable accessibilityRole="button" accessibilityLabel={zoomed ? 'Fit to screen' : 'Zoom in'} onPress={() => setZoomed(value => !value)} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>{zoomed ? 'Fit to screen' : 'Zoom in'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Close screenshot" onPress={() => setOpen(false)} style={{ minHeight: 48, justifyContent: 'center', alignSelf: 'flex-end', paddingHorizontal: 12 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Close</Text></Pressable></View><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{caption}</Text></View>
        {zoomed ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}><ScrollView horizontal style={{ width: '100%', height: zoomHeight, flexGrow: 0 }}><Image source={source} accessibilityLabel={caption} resizeMode="contain" style={{ width: zoomWidth, height: zoomHeight }} /></ScrollView></ScrollView>
          : <Image source={source} accessibilityLabel={caption} resizeMode="contain" style={{ flex: 1, width: '100%', minHeight: 0, marginVertical: 12 }} />}
      </SafeAreaView>
    </Modal>
  </View>;
}
