import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Text from './AppText';
import { useAppTheme } from './AppTheme';
import ExerciseVideo from './ExerciseVideo';
import bundledImages from '../lib/exerciseMediaAssets';
import { loadAssignmentDemonstrations } from '../lib/exerciseDemonstrations';

const imageSource = url => bundledImages[url] || (url?.startsWith('https://') ? { uri: url } : undefined);
const MediaCache = createContext(null);

// Scope recovered media to this signed-in patient; discard it on account change.
export function ExerciseMediaProvider({ children }) {
  const cache = useRef(new Map());
  return <MediaCache.Provider value={cache}>{children}</MediaCache.Provider>;
}

function MediaItem({ item, name, active, onPlay, onClose, onEnlarge, compact, frameHeight }) {
  const { colors } = useAppTheme();
  const [failed, setFailed] = useState(false);
  const [linkError, setLinkError] = useState('');
  const onError = useCallback(() => setFailed(true), []);
  const video = item.kind === 'video-link';
  const source = imageSource(video ? item.preview?.poster : item.url);
  const buttonStyle = [styles.button, { borderColor: colors.border, backgroundColor: colors.raised }];
  const textStyle = { color: colors.text };
  const openSource = async () => {
    try { await Linking.openURL(item.sourceUrl || item.url); }
    catch { setLinkError('The source could not be opened. Please try again.'); }
  };
  return <View style={[styles.item, { borderColor: colors.border }]}>
    <View style={[styles.frame, compact && { aspectRatio: undefined, height: frameHeight }]}>
      {failed ? <View style={[styles.fallback, { backgroundColor: colors.surface }]}><Text style={textStyle}>Demonstration could not be loaded.</Text><Pressable accessibilityRole="button" accessibilityLabel={video && item.preview ? `Play demonstration for ${name}` : 'Retry demonstration'} onPress={() => { setFailed(false); if (video && item.preview) onPlay(); }} style={buttonStyle}><Text style={textStyle}>{video && item.preview ? '▶ Try video' : 'Retry demonstration'}</Text></Pressable></View>
        : video && (active || !source && item.preview?.kind === 'video') ? <ExerciseVideo key={String(active)} preview={item.preview} title={`${name} demonstration video`} active={active} onError={onError} />
          : source ? <Pressable accessibilityRole="button" accessibilityLabel={video ? `Play demonstration for ${name}` : `Enlarge demonstration for ${name}`} onPress={video ? onPlay : () => onEnlarge(source)} style={styles.fill}>
            <Image source={source} accessibilityLabel={`${name} demonstration`} resizeMode="contain" style={styles.fill} onError={onError} />
            {video && <View style={styles.play}><Text style={styles.playText}>▶ Play video</Text></View>}
          </Pressable> : <View style={[styles.fallback, { backgroundColor: colors.surface }]}><Text style={textStyle}>{video && item.preview ? 'Video demonstration' : 'Open the source to view this demonstration.'}</Text>{video && item.preview && <Pressable accessibilityRole="button" accessibilityLabel={`Play demonstration for ${name}`} onPress={onPlay} style={buttonStyle}><Text style={textStyle}>▶ Play video</Text></Pressable>}</View>}
      {video && !active && !source && item.preview?.kind === 'video' && !failed && <Pressable accessibilityRole="button" accessibilityLabel={`Play demonstration for ${name}`} onPress={onPlay} style={styles.play}><Text style={styles.playText}>▶ Play video</Text></Pressable>}
    </View>
    <View style={[styles.caption, compact && styles.compactCaption]}>
      {!compact && <Text style={[textStyle, styles.title]}>{item.title}</Text>}
      {!!item.source && <Text style={[{ color: colors.muted }, compact && styles.compactSource]}>{item.source}</Text>}
      {active && <Pressable accessibilityRole="button" onPress={onClose} style={[buttonStyle, compact && styles.compactButton]}><Text style={textStyle}>Close video</Text></Pressable>}
      {!!item.accessNote && <Text style={{ color: colors.muted }}>{item.accessNote}</Text>}
      {!!(item.sourceUrl || item.url.startsWith('https://')) && <Pressable accessibilityRole="link" accessibilityLabel={`Open demonstration source for ${name}`} onPress={openSource} style={[buttonStyle, compact && styles.compactButton]}><Text style={{ color: colors.brand }}>Open source</Text></Pressable>}
      {!!linkError && <Text accessibilityRole="alert" style={{ color: colors.error }}>{linkError}</Text>}
    </View>
  </View>;
}

export default function ExerciseDemonstration({ exercise, compact = false }) {
  const { colors } = useAppTheme();
  const { height } = useWindowDimensions();
  const cache = useContext(MediaCache);
  const cacheKey = `${exercise.routineAssignmentId}:${exercise.assignmentExerciseId}`;
  const recovered = cache?.current.get(cacheKey);
  const [media, setMedia] = useState(recovered || exercise.media || []);
  const [error, setError] = useState(recovered ? '' : exercise.mediaError || '');
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(null);
  const [enlarged, setEnlarged] = useState(null);
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    const restored = cache?.current.get(cacheKey);
    setMedia(restored || exercise.media || []); setError(restored ? '' : exercise.mediaError || ''); setActive(null); setEnlarged(null); setSelected(0);
  }, [exercise.id, exercise.media, exercise.mediaError, cache, cacheKey]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') { setActive(null); setEnlarged(null); } });
    return () => listener.remove();
  }, []);
  const retry = async () => {
    setLoading(true);
    try {
      const demos = await loadAssignmentDemonstrations(exercise.routineAssignmentId);
      const restored = demos.get(exercise.assignmentExerciseId)?.media || [];
      cache?.current.set(cacheKey, restored);
      setMedia(restored); setError('');
    } catch { setError('Demonstrations could not be loaded. Please retry.'); }
    finally { setLoading(false); }
  };
  if (!Object.prototype.hasOwnProperty.call(exercise, 'media') && !error) return null;
  const changeMedia = next => { setSelected(next); setActive(null); };
  const frameHeight = Math.min(240, Math.max(90, Math.round(height * 0.21) - 16));
  return <View style={[styles.container, compact && styles.compactContainer]}>
    <View style={styles.mediaHeading}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }, compact && styles.compactTitle]}>Demonstration{compact && media.length > 1 ? ` ${selected + 1} of ${media.length}` : ''}</Text>
      {compact && media.length > 1 && <View style={styles.mediaNavigation}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous demonstration" disabled={selected === 0} onPress={() => changeMedia(selected - 1)} style={[styles.navigationButton, { opacity: selected === 0 ? 0.35 : 1, borderColor: colors.border }]}><Text style={{ color: colors.text }}>‹</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next demonstration" disabled={selected >= media.length - 1} onPress={() => changeMedia(selected + 1)} style={[styles.navigationButton, { opacity: selected >= media.length - 1 ? 0.35 : 1, borderColor: colors.border }]}><Text style={{ color: colors.text }}>›</Text></Pressable>
      </View>}
    </View>
    {!!error && <View><Text accessibilityRole="alert" style={{ color: colors.error }}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry exercise media" disabled={loading} onPress={retry} style={[styles.button, { borderColor: colors.border }]}><Text style={{ color: colors.brand }}>{loading ? 'Loading…' : 'Retry media'}</Text></Pressable></View>}
    {!error && !media.length && <Text style={{ color: colors.muted }}>No demonstration is available for this exercise yet.</Text>}
    {media.map((item, index) => (!compact || index === selected) && <MediaItem key={`${exercise.id}:${index}:${item.url}`} item={item} name={exercise.name} active={active === index} onPlay={() => setActive(index)} onClose={() => setActive(null)} onEnlarge={setEnlarged} compact={compact} frameHeight={frameHeight} />)}
    <Modal visible={!!enlarged} transparent={false} animationType="none" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']} onRequestClose={() => setEnlarged(null)}>
      <View style={[styles.modal, { backgroundColor: colors.surface }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close enlarged demonstration" onPress={() => setEnlarged(null)} style={[styles.button, { borderColor: colors.border, alignSelf: 'flex-end' }]}><Text style={{ color: colors.text }}>Close picture</Text></Pressable>
        <ScrollView contentContainerStyle={styles.enlarged} maximumZoomScale={4} minimumZoomScale={1}>{enlarged && <Image source={enlarged} accessibilityLabel={`${exercise.name} enlarged demonstration`} resizeMode="contain" style={styles.fill} />}</ScrollView>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 12, width: '100%', marginVertical: 12 },
  compactContainer: { gap: 4, marginVertical: 4 },
  mediaHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mediaNavigation: { flexDirection: 'row', gap: 6 },
  navigationButton: { minWidth: 44, minHeight: 44, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  compactTitle: { fontSize: 14, flexShrink: 1 },
  compactCaption: { paddingHorizontal: 8, paddingVertical: 2, gap: 4, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  compactSource: { fontSize: 12, flex: 1 },
  compactButton: { paddingVertical: 4, paddingHorizontal: 8, borderWidth: 0 },
  title: { fontSize: 16, fontWeight: '700' },
  item: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  frame: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#FFFFFF', position: 'relative' },
  fill: { width: '100%', height: '100%' },
  fallback: { flex: 1, padding: 12, gap: 8, alignItems: 'center', justifyContent: 'center' },
  play: { position: 'absolute', alignSelf: 'center', bottom: 12, padding: 12, borderRadius: 8, backgroundColor: '#125b75' },
  playText: { color: '#FFFFFF', fontWeight: '700' },
  caption: { padding: 12, gap: 8 },
  button: { padding: 12, minHeight: 44, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modal: { flex: 1, paddingHorizontal: 16, paddingTop: 60, paddingBottom: 24, gap: 12 },
  enlarged: { flexGrow: 1, width: '100%', height: '100%' },
});
