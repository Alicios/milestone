import React, { useState } from 'react';
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
  const [routineStarted, setRoutineStarted] = useState(false);

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

        {!routineStarted && (
          <View style={styles.welcomeCard}>
            <Text style={styles.welcomeTitle}>WELCOME BACK,</Text>
            <Text style={styles.welcomeTitle}>FRANK</Text>
            <View style={styles.welcomeRule} />
            <Text style={styles.welcomeSubtext}>
              let's pick up where you left off
            </Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Today's routine</Text>
            <Text style={styles.sectionSubtitle}>4 exercises · about 15 minutes</Text>
          </View>
          <View style={styles.progressBadge}>
            <Text style={styles.progressText}>0 / 4</Text>
          </View>
        </View>

        <View style={styles.exerciseList}>
          {routineStarted && (
            <View style={styles.expandedExercise}>
              <View style={styles.expandedHeader}>
                <Text style={styles.expandedHeaderText}>Push Ups</Text>
              </View>

              <View style={styles.overviewPanel}>
                <View style={styles.infoIcon}>
                  <Text style={styles.infoIconText}>(i)</Text>
                </View>

                <Text style={styles.overviewText}>
                  A classic calisthenics exercise where you lift and lower your 
                  body using your arms while keeping your legs and torso straight.
                </Text>
              </View>

              <View style={styles.statsRow}>
                <Text style={styles.statsText}>3 Sets</Text>
                <Text style={styles.statsText}>5 Reps</Text>
              </View>
            </View>
          )}

          {exercises
            .slice(routineStarted ? 1 : 0)
            .map((exercise, index, visibleExercises) => (
              <View
                key={exercise.name}
                style={[
                  styles.exerciseRow,
                  { backgroundColor: exercise.accent },
                  !routineStarted && index === 0 && styles.firstExercise,
                  index === visibleExercises.length - 1 && styles.lastExercise,
                ]}
              >
                <View style={styles.exerciseNumber}>
                  <Text style={styles.exerciseNumberText}>
                    {routineStarted ? index + 2 : index + 1}
                  </Text>
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
          onPress={() => setRoutineStarted(true)}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {routineStarted ? 'START' : 'START ROUTINE'}
          </Text>

          
        </Pressable>

        <Text style={styles.footerText}>Move well. Feel better.</Text>
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
  welcomeCard: {
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
  welcomeTitle: {
    color: palette.white,
    fontFamily: 'sans-serif-condensed',
    fontSize: 31,
    fontWeight: '900',
    lineHeight: 34,
  },
  welcomeRule: {
    backgroundColor: palette.orangeDark,
    height: 1,
    marginTop: 13,
    opacity: 0.55,
    width: '100%',
  },
  welcomeSubtext: {
    color: palette.ink,
    fontFamily: 'serif',
    fontSize: 18,
    fontStyle: 'italic',
    marginTop: 9,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 11,
    marginTop: 30,
  },
  sectionTitle: {
    color: palette.ink,
    fontFamily: 'sans-serif-condensed',
    fontSize: 23,
    fontWeight: '800',
  },
  sectionSubtitle: {
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
  footerText: {
    color: palette.tealDark,
    fontFamily: 'serif',
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 'auto',
    opacity: 0.85,
    textAlign: 'center',
  },
  expandedExercise: {
    backgroundColor: palette.teal,
  },
  expandedHeader: {
    alignItems: 'center',
    backgroundColor: palette.orange,
    borderBottomColor: palette.ink,
    borderBottomWidth: 1.4,
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  expandedHeaderText: {
    color: palette.white,
    fontFamily: 'serif',
    fontSize: 27,
    fontStyle: 'italic',
  },
  overviewPanel: {
    alignItems: 'center',
    backgroundColor: palette.teal,
    flexDirection: 'row',
    minHeight: 220,
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  infoIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 247, 0.55)',
    borderColor: palette.ink,
    borderRadius: 26,
    borderWidth: 1.4,
    height: 52,
    justifyContent: 'center',
    marginRight: 16,
    width: 52,
  },
  infoIconText: {
    color: palette.ink,
    fontFamily: 'serif',
    fontSize: 20,
    fontStyle: 'italic',
  },
  overviewText: {
    color: palette.ink,
    flex: 1,
    fontFamily: 'serif',
    fontSize: 17,
    lineHeight: 24,
  },
  statsRow: {
    alignItems: 'center',
    backgroundColor: palette.orange,
    borderBottomColor: palette.ink,
    borderBottomWidth: 1.4,
    borderTopColor: palette.ink,
    borderTopWidth: 1.4,
    flexDirection: 'row',
    justifyContent: 'space-around',
    minHeight: 56,
  },
  statsText: {
    color: palette.white,
    fontFamily: 'serif',
    fontSize: 24,
    fontStyle: 'italic',
  },
});
