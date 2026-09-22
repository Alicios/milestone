import React from 'react';
import {
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

const palette = {
  cream: '#F4EACF',
  orange: '#E9611C',
  orangeDark: '#B84613',
  teal: '#9BCBC5',
  tealDark: '#357F83',
  blue: '#55A7B7',
  ink: '#193333',
  white: '#FFFDF7',
};

const exercises = [
  { name: 'Push Ups', detail: 'Upper body', accent: '#8BC0BC' },
  { name: 'Sit Ups', detail: 'Core strength', accent: '#91C6C1' },
  { name: 'Quad Stretch', detail: 'Flexibility', accent: '#98CCC5' },
  { name: 'Leg Stretch', detail: 'Lower body', accent: '#A0D1C9' },
];

export default function App() {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width - 44, 390);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.cream} />

      <View style={[styles.container, { maxWidth: contentWidth }]}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.brand}>MILESTONE</Text>
          </View>

          <View style={styles.avatar}>
            <Text style={styles.avatarText}>F</Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.headingLarge}>WELCOME BACK,</Text>
          <Text style={styles.headingLarge}>FRANK</Text>

          <View style={styles.decorativeRule} />

          <Text style={styles.serifItalic}>
            let's pick up where you left off
          </Text>
        </View>

        <View style={styles.sectionRow}>
          <View>
            <Text style={styles.headingMedium}>Today's routine</Text>
            <Text style={styles.caption}>
              4 exercises · about 15 minutes
            </Text>
          </View>

          <View style={styles.progressBadge}>
            <Text style={styles.progressText}>0 / 4</Text>
          </View>
        </View>

        <View style={styles.exerciseList}>
          {exercises.map((exercise, index) => (
            <View
              key={exercise.name}
              style={[
                styles.exerciseRow,
                { backgroundColor: exercise.accent },
                index === 0 && styles.firstExercise,
                index === exercises.length - 1 && styles.lastExercise,
              ]}
            >
              <View style={styles.exerciseNumber}>
                <Text style={styles.exerciseNumberText}>{index + 1}</Text>
              </View>

              <View style={styles.exerciseCopy}>
                <Text style={styles.listTitle}>{exercise.name}</Text>
                <Text style={styles.listSubtitle}>{exercise.detail}</Text>
              </View>

              <Text style={styles.chevron}>›</Text>
            </View>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start today's routine"
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>LET'S GO</Text>
          
        </Pressable>

        <Text style={styles.secondaryText}>
          Move well. Feel better.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.cream,
  },

  container: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 20,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  eyebrow: {
    color: palette.tealDark,
    fontFamily: 'sans-serif-medium',
    fontSize: 11,
    letterSpacing: 2.4,
    marginBottom: 2,
  },

  brand: {
    color: palette.ink,
    fontFamily: 'sans-serif-condensed',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1,
  },

  avatar: {
    alignItems: 'center',
    backgroundColor: palette.orange,
    borderColor: palette.ink,
    borderRadius: 22,
    borderWidth: 1.5,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },

  avatarText: {
    color: palette.white,
    fontFamily: 'sans-serif-condensed',
    fontSize: 21,
    fontWeight: '800',
  },

  heroCard: {
    backgroundColor: palette.orange,
    borderColor: palette.ink,
    borderRadius: 20,
    borderWidth: 1.8,
    elevation: 2,
    paddingHorizontal: 18,
    paddingVertical: 17,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
  },

  headingLarge: {
    color: palette.white,
    fontFamily: 'sans-serif-condensed',
    fontSize: 31,
    fontWeight: '900',
    lineHeight: 34,
  },

  decorativeRule: {
    backgroundColor: palette.orangeDark,
    height: 1,
    marginTop: 13,
    opacity: 0.55,
    width: '100%',
  },

  serifItalic: {
    color: palette.ink,
    fontFamily: 'serif',
    fontSize: 18,
    fontStyle: 'italic',
    marginTop: 9,
  },

  sectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 11,
    marginTop: 30,
  },

  headingMedium: {
    color: palette.ink,
    fontFamily: 'sans-serif-condensed',
    fontSize: 23,
    fontWeight: '800',
  },

  caption: {
    color: palette.tealDark,
    fontFamily: 'sans-serif',
    fontSize: 12,
    marginTop: 2,
  },

  progressBadge: {
    backgroundColor: palette.white,
    borderColor: palette.tealDark,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  progressText: {
    color: palette.tealDark,
    fontFamily: 'sans-serif-medium',
    fontSize: 12,
  },

  exerciseList: {
    borderColor: palette.ink,
    borderRadius: 20,
    borderWidth: 1.6,
    overflow: 'hidden',
  },

  exerciseRow: {
    alignItems: 'center',
    borderBottomColor: palette.ink,
    borderBottomWidth: 1.4,
    flexDirection: 'row',
    minHeight: 63,
    paddingHorizontal: 14,
  },

  firstExercise: {
    minHeight: 71,
  },

  lastExercise: {
    borderBottomWidth: 0,
  },

  exerciseNumber: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 247, 0.55)',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    marginRight: 12,
    width: 30,
  },

  exerciseNumberText: {
    color: palette.ink,
    fontFamily: 'sans-serif-medium',
    fontSize: 13,
  },

  exerciseCopy: {
    flex: 1,
  },

  listTitle: {
    color: palette.ink,
    fontFamily: 'serif',
    fontSize: 22,
    fontStyle: 'italic',
  },

  listSubtitle: {
    color: palette.tealDark,
    fontFamily: 'sans-serif',
    fontSize: 11,
    marginTop: 1,
  },

  chevron: {
    color: palette.ink,
    fontFamily: 'sans-serif',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
    opacity: 0.65,
  },

  primaryButton: {
    alignItems: 'center',
    backgroundColor: palette.blue,
    borderColor: palette.tealDark,
    borderRadius: 19,
    borderWidth: 1.5,
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 26,
    minHeight: 66,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },

  primaryButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },

  primaryButtonText: {
    color: palette.white,
    fontFamily: 'sans-serif-condensed',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  primaryButtonIcon: {
    color: palette.white,
    fontSize: 24,
    marginLeft: 11,
  },

  secondaryText: {
    color: palette.tealDark,
    fontFamily: 'serif',
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 'auto',
    opacity: 0.85,
    textAlign: 'center',
  },
});