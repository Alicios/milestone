import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Text from './AppText';
import { useAppTheme } from './AppTheme';

export default function ExerciseReviewFeedback({ review, explanationRef, onExplanationFocus, onExplanationBlur }) {
  const { colors, mode } = useAppTheme();
  const { value, change, submit, saving, error } = review;
  const ink = colors.text;
  const painColors = score => score <= 3
    ? { backgroundColor: mode === 'dark' ? '#204b36' : '#d4eddd', color: mode === 'dark' ? '#dcf8e7' : '#174c30' }
    : score <= 6 ? { backgroundColor: mode === 'dark' ? '#584b1e' : '#fff1b8', color: mode === 'dark' ? '#fff2b8' : '#594400' }
      : { backgroundColor: mode === 'dark' ? '#792333' : '#fbe0e0', color: mode === 'dark' ? '#fff1f3' : '#792d32' };
  return <View style={styles.section}>
    {Boolean(review.readError) && <View>
      <Text accessibilityRole="alert" style={{ color: colors.error }}>{review.readError}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry saved exercise feedback" disabled={saving || review.loadingSaved}
        onPress={review.reloadSaved} style={[styles.next, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
        <Text style={{ color: ink }}>{review.loadingSaved ? 'LOADING?' : 'RETRY SAVED RESPONSES'}</Text>
      </Pressable>
    </View>}
    <Text style={[styles.heading, { color: ink }]}>How much pain did you feel during this exercise?</Text>
    <Text style={{ color: colors.muted }}>Choose a pain score (required)</Text>
    {[0, 5].map(start => <View key={start} style={styles.row}>
      {Array.from({ length: 5 }, (_, index) => start + index + 1).map(score => {
        const tone = painColors(score);
        const selected = value.painScore === score;
        return <Pressable key={score} accessibilityRole="button" accessibilityLabel={`Pain ${score} out of 10`}
          accessibilityState={{ selected, disabled: saving }} aria-pressed={selected} disabled={saving}
          onPress={() => change({ painScore: score })}
          style={[styles.painButton, { backgroundColor: tone.backgroundColor, borderColor: selected ? ink : colors.border, borderWidth: selected ? 3 : 1 }]}>
          <Text style={[styles.number, { color: tone.color }]}>{score}</Text>
          <Text style={{ color: tone.color, fontSize: 10 }}>{selected ? 'Selected' : ' '}</Text>
        </Pressable>;
      })}
    </View>)}
    <View style={styles.endpoints}><Text style={{ color: ink }}>1 — Least pain</Text><Text style={{ color: ink }}>10 — Most pain</Text></View>
    <Text style={{ color: colors.muted, fontSize: 12 }}>1–3 green · 4–6 amber · 7–10 red</Text>
    <Text style={[styles.heading, { color: ink, marginTop: 12 }]}>How did that feel? (required)</Text>
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
    {value.feeling && value.feeling !== 'good' && <View>
      <Text style={{ color: ink, marginBottom: 6 }}>Tell your provider why (required)</Text>
      <TextInput ref={explanationRef} accessibilityLabel="Tell your provider why" value={value.explanation || ''}
        onFocus={onExplanationFocus} onBlur={onExplanationBlur}
        onChangeText={explanation => change({ explanation })} multiline maxLength={4000} editable={!saving}
        textAlignVertical="top" placeholder="Describe how the exercise felt" placeholderTextColor={colors.muted}
        style={[styles.explanation, { color: ink, borderColor: colors.border, backgroundColor: colors.surface }]} />
      <Text style={{ color: colors.muted, fontSize: 12 }}>{[...(value.explanation || '')].length}/4000</Text>
    </View>}
    {Boolean(error) && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ color: colors.error }}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="Next exercise" accessibilityState={{ disabled: saving }} disabled={saving}
      onPress={submit} style={[styles.next, { backgroundColor: colors.accent, opacity: saving ? .6 : 1 }]}>
      <Text style={{ color: colors.onAccent, fontWeight: '800', fontSize: 18 }}>{saving ? 'SAVING…' : error ? 'RETRY / NEXT' : 'NEXT'}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 10, alignSelf: 'stretch' }, heading: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 6 }, endpoints: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  painButton: { flex: 1, minHeight: 56, minWidth: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingVertical: 5 },
  number: { fontSize: 20, fontWeight: '800' }, feeling: { flex: 1, minHeight: 78, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 8 },
  emoji: { fontSize: 28 }, explanation: { minHeight: 110, maxHeight: 140, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  next: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 14, marginTop: 10 },
});
