import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Text from './AppText';
import { useAppTheme } from './AppTheme';
import ReviewCard from './ReviewCard';
import PainSlider from './PainSlider';

export default function ExerciseReviewFeedback({ review, explanationRef, onExplanationFocus, onExplanationBlur }) {
  const { colors } = useAppTheme();
  const { value, change, submit, saving, error } = review;
  const ink = colors.text;
  return <View style={styles.section}>
    {Boolean(review.readError) && <View>
      <Text accessibilityRole="alert" style={{ color: colors.error }}>{review.readError}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry saved exercise feedback" disabled={saving || review.loadingSaved}
        onPress={review.reloadSaved} style={[styles.next, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
        <Text style={{ color: ink }}>{review.loadingSaved ? 'LOADING?' : 'RETRY SAVED RESPONSES'}</Text>
      </Pressable>
    </View>}
    <ReviewCard title="How did it feel?" testID="exercise-feeling">
    <Text style={[styles.hint, { color: colors.text }]}>Choose one (required)</Text>
    <View style={styles.row}>
      {[['good', '👍', 'Good'], ['neutral', '😐', 'Neutral'], ['difficult', '👎', 'Difficult']].map(([feeling, emoji, label]) => {
        const selected = value.feeling === feeling;
        return <Pressable key={feeling} accessibilityRole="button" accessibilityLabel={`Exercise felt ${feeling}`}
          accessibilityState={{ selected, disabled: saving }} aria-pressed={selected} disabled={saving}
          onPress={() => change({ feeling, ...(feeling === 'good' ? { explanation: '' } : {}) })}
          style={[styles.feeling, { backgroundColor: selected ? colors.tint : colors.surface, borderColor: selected ? ink : colors.border, borderWidth: selected ? 3 : 1 }]}>
          <Text style={styles.emoji}>{emoji}</Text><Text style={{ color: ink, fontWeight: '700' }}>{label}</Text>
        </Pressable>;
      })}
    </View>
    {value.feeling && value.feeling !== 'good' && <View style={styles.explanationSection}>
      <Text style={{ color: ink, marginBottom: 6 }}>Tell your provider why (required)</Text>
      <TextInput ref={explanationRef} accessibilityLabel="Tell your provider why" value={value.explanation || ''}
        onFocus={onExplanationFocus} onBlur={onExplanationBlur}
        onChangeText={explanation => change({ explanation })} multiline maxLength={4000} editable={!saving}
        textAlignVertical="top" placeholder="Describe how the exercise felt" placeholderTextColor={colors.muted}
        style={[styles.explanation, { color: ink, borderColor: colors.border, backgroundColor: colors.surface }]} />
      <Text style={{ color: colors.muted, fontSize: 12 }}>{[...(value.explanation || '')].length}/4000</Text>
    </View>}
    </ReviewCard>
    <ReviewCard title="Pain level" testID="exercise-pain">
      <View style={styles.painSummary}>
        <Text style={[styles.painPrompt, { color: ink }]}>How much pain did you feel during this exercise?</Text>
        <Text style={[styles.score, { color: ink }]}>{value.painScore == null ? '—' : value.painScore}<Text style={styles.scoreTotal}> / 10</Text></Text>
      </View>
      <PainSlider value={value.painScore} disabled={saving} onChange={painScore => change({ painScore })} />
      <View style={styles.endpoints}><Text style={{ color: ink }}>1 · Least pain</Text><Text style={{ color: ink }}>10 · Most pain</Text></View>
      <Text style={[styles.sliderHint, { color: ink }]}>{value.painScore == null ? 'Slide to choose a pain score (required)' : `Selected: ${value.painScore} out of 10`}</Text>
    </ReviewCard>
    {Boolean(error) && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ color: colors.error }}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="Next exercise" accessibilityState={{ disabled: saving }} disabled={saving}
      onPress={submit} style={[styles.next, { backgroundColor: colors.accent, opacity: saving ? .6 : 1 }]}>
      <Text style={{ color: colors.onAccent, fontWeight: '800', fontSize: 18 }}>{saving ? 'SAVING…' : error ? 'RETRY / NEXT' : 'NEXT'}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 16, marginTop: 16, alignSelf: 'stretch' },
  hint: { fontSize: 13, marginBottom: 12 },
  explanationSection: { marginTop: 16 },
  row: { flexDirection: 'row', gap: 6 }, endpoints: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  painSummary: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  painPrompt: { fontSize: 14, flexGrow: 1, flexShrink: 1, flexBasis: 150 },
  score: { fontSize: 28, fontWeight: '800' }, scoreTotal: { fontSize: 14, fontWeight: '500' },
  sliderHint: { fontSize: 12, marginTop: 12 },
  feeling: { flex: 1, minWidth: 0, minHeight: 78, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 8 },
  emoji: { fontSize: 28 }, explanation: { minHeight: 110, maxHeight: 140, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  next: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 14, marginTop: 10 },
});
