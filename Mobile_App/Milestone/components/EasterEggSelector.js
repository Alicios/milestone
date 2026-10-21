import { useAppTheme, useThemedStyles } from './AppTheme';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';
import Play from 'lucide-react-native/icons/play';
import Pause from 'lucide-react-native/icons/pause';
import X from 'lucide-react-native/icons/x';
import Text from './AppText';
import useEasterEggAudio from './useEasterEggAudio';
import useImageMotionTilt from './useImageMotionTilt';
import ImageSpotlight from './ImageSpotlight';

const images = [
  { label: 'The King', description: 'LeBron James in a Los Angeles Lakers uniform.', source: require('../assets/easter-egg/lebron-king.jpg'), sound: require('../assets/easter-egg/lebroooon-james.mp3'), aspectRatio: 16 / 9 },
  { label: 'Number 76', description: 'LeBron James, number 76.', source: require('../assets/easter-egg/lebron-76.jpg'), sound: require('../assets/easter-egg/bang-basketball_Y4765Ub.mp3'), aspectRatio: 3 / 2 },
  { label: 'NFL', description: 'LeBron James holding a football in a Dallas Cowboys cap.', source: require('../assets/easter-egg/lebron-nfl.jpg'), sound: require('../assets/easter-egg/nfl-on-fox-theme-music.mp3'), aspectRatio: 474 / 324 },
];

export default function EasterEggSelector({ onClose }) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useAppTheme();
  const [selected, setSelected] = useState({ index: 0, flip: 0 });
  const regularSide = useRef(0);
  const [error, setError] = useState('');
  const active = useRef(true);
  const playbackRequest = useRef(0);
  const current = images[selected.index];
  const { player, status } = useEasterEggAudio(current.sound);
  const motion = useImageMotionTilt();
  const motionRef = useRef(motion);
  motionRef.current = motion;
  const imageSize = useRef({ width: 1, height: 1 });
  const dragged = useRef(false);
  const drag = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => motionRef.current.touchEnabled && (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4),
    onPanResponderGrant: (_, gesture) => {
      dragged.current = true;
      motionRef.current.beginTouch();
      motionRef.current.moveTouch(gesture.dx, gesture.dy, imageSize.current.width, imageSize.current.height);
    },
    onPanResponderMove: (_, gesture) => motionRef.current.moveTouch(gesture.dx, gesture.dy, imageSize.current.width, imageSize.current.height),
    onPanResponderRelease: () => motionRef.current.endTouch(),
    onPanResponderTerminate: () => motionRef.current.endTouch(),
    onPanResponderTerminationRequest: () => false,
  })).current;
  const SoundIcon = status.playing ? Pause : Play;

  useEffect(() => {
    active.current = true;
    // The audio hook releases its player and stops playback on unmount.
    return () => { active.current = false; playbackRequest.current += 1; };
  }, []);

  function close() {
    active.current = false;
    playbackRequest.current += 1;
    player.pause();
    onClose();
  }

  const playSound = useCallback(async (restart) => {
    const request = ++playbackRequest.current;
    setError('');
    try {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
      if (!active.current || playbackRequest.current !== request) return;
      if (restart) await player.seekTo(0);
      if (active.current && playbackRequest.current === request) await player.play();
    } catch {
      if (active.current && playbackRequest.current === request) setError('The sound couldn’t play. Please try again.');
    }
  }, [player]);

  useEffect(() => {
    if (!status.isLoaded) return;
    playSound(true);
    return () => { playbackRequest.current += 1; };
  }, [playSound, status.isLoaded, selected.flip]);

  function flipImage() {
    if (dragged.current) return;
    playbackRequest.current += 1;
    player.pause();
    regularSide.current = 1 - regularSide.current;
    const index = Math.random() < 0.1 ? 2 : regularSide.current;
    setError('');
    setSelected(selection => ({ index, flip: selection.flip + 1 }));
  }

  function toggleSound() {
    if (status.playing) {
      playbackRequest.current += 1;
      player.pause();
      return;
    }
    playSound(status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration));
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={StyleSheet.absoluteFill} />
        <View style={styles.card} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={styles.heading}>
                <Text style={styles.eyebrow}>YOU FOUND IT</Text>
                <Text accessibilityRole="header" style={styles.title}>LeTeam</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close hidden selector" onPress={close} style={styles.close}>
                <X size={24} color={colors.text} accessible={false} />
              </Pressable>
            </View>

            <View testID="easter-egg-touch-tilt" {...drag.panHandlers} style={styles.tiltSpace} onLayout={({ nativeEvent: { layout } }) => { imageSize.current = { width: layout.width, height: layout.height }; }}>
              <Animated.View testID="easter-egg-image-tilt" style={{ transform: [
                { perspective: 900 },
                { rotateX: motion.tilt.x.interpolate({ inputRange: [-45, 45], outputRange: ['-45deg', '45deg'], extrapolate: 'clamp' }) },
                { rotateY: motion.tilt.y.interpolate({ inputRange: [-45, 45], outputRange: ['-45deg', '45deg'], extrapolate: 'clamp' }) },
              ] }}>
                <Pressable accessibilityRole="button" accessibilityLabel="Flip the LeBron image" accessibilityHint="Tap to flip. Drag to tilt the photo." onPressIn={() => { dragged.current = false; }} onPress={flipImage} style={styles.preview}>
                  <Image accessibilityLabel={current.description} source={current.source} resizeMode="contain" style={[styles.image, { aspectRatio: current.aspectRatio }]} />
                  <ImageSpotlight tilt={motion.tilt} motionStatus={motion.status} />
                </Pressable>
              </Animated.View>
            </View>
            <Text style={styles.hint}>{motion.status === 'active' ? 'Tilt your phone or drag the photo to tilt it. ' : motion.touchEnabled ? 'Drag the photo to tilt it. ' : ''}Tap the image to flip.</Text>
            {motion.status === 'denied' && <Pressable accessibilityRole="button" accessibilityLabel="Enable image motion tilt" onPress={motion.enable} style={styles.enableMotion}><Text style={styles.hint}>Enable motion tilt</Text></Pressable>}
            {motion.status === 'blocked' && <Text style={styles.hint}>Enable motion access for Milestone in your phone settings to use tilt.</Text>}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={status.playing ? 'Pause the easter egg sound' : 'Play the easter egg sound'}
              accessibilityState={{ disabled: !status.isLoaded }}
              disabled={!status.isLoaded}
              onPress={toggleSound}
              style={[styles.soundButton, !status.isLoaded && styles.loading]}
            >
              {!status.isLoaded ? <ActivityIndicator color={colors.onAccent} /> : <SoundIcon size={20} color={colors.onAccent} accessible={false} />}
              <Text style={styles.soundLabel}>{!status.isLoaded ? 'Loading sound…' : status.playing ? 'Pause sound' : 'Play sound'}</Text>
            </Pressable>
            {(error || status.error) && <Text accessibilityRole="alert" style={styles.error}>{error || 'The sound couldn’t load. Close the selector and try again.'}</Text>}
            <Text style={styles.caption}>
              {current.label === 'NFL' ? 'Lets play some Football!' : 'LeTeam was for a King'}
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const baseStyles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12, 35, 35, 0.65)', paddingVertical: '5%' },
  card: { width: '92%', maxWidth: 720, maxHeight: '94%', backgroundColor: '#F4EACF', borderRadius: 24, overflow: 'hidden' },
  content: { padding: '5%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 },
  heading: { flex: 1 },
  eyebrow: { color: '#357F83', fontSize: 10, fontWeight: '700', letterSpacing: 1.8, marginBottom: 5 },
  title: { color: '#125b75', fontSize: 32, fontWeight: '800' },
  close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFDF7', borderRadius: 22 },
  preview: { width: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#193333' },
  tiltSpace: { padding: '3%' },
  enableMotion: { minHeight: 44, justifyContent: 'center' },
  image: { width: '100%', height: 'auto' },
  hint: { fontSize: 12, lineHeight: 19, color: '#357F83', textAlign: 'center', marginVertical: 12 },
  soundButton: { minHeight: 52, backgroundColor: '#125b75', borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12 },
  soundLabel: { color: '#FFFDF7', fontSize: 15, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  loading: { opacity: 0.6 },
  error: { color: '#B84613', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 12 },
  caption: { color: '#125b75', fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: 20 },
});
