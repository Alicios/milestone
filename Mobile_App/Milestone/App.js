import React, { useEffect, useState } from 'react';
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
  {
    name: 'Push Ups',
    detail: 'Upper body',
    accent: '#8BC0BC',
    type: 'countup',
    sets: 3,
    reps: 5,
  },
  {
    name: 'Sit Ups',
    detail: 'Core strength',
    accent: '#91C6C1',
    type: 'countup',
    sets: 3,
    reps: 5,
  },
  {
    name: 'Quad Stretch',
    detail: 'Flexibility',
    accent: '#98CCC5',
    type: 'countdown',
    durationSeconds: 30,
    sets: 1,
    reps: 1,
  },
  {
    name: 'Leg Stretch',
    detail: 'Lower body',
    accent: '#A0D1C9',
    type: 'countdown',
    durationSeconds: 30,
    sets: 1,
    reps: 1,
  },
];

function getStartingTime(exercise) {
  return exercise.type === 'countdown'
    ? exercise.durationSeconds * 100
    : 0;
}

function formatTimer(centiseconds) {
  const safeTime = Math.max(0, centiseconds);
  const minutes = Math.floor(safeTime / 6000);
  const seconds = Math.floor((safeTime % 6000) / 100);
  const hundredths = safeTime % 100;

  return `${String(minutes).padStart(2, '0')}.${String(seconds).padStart(
    2,
    '0'
  )}.${String(hundredths).padStart(2, '0')}`;
}

export default function App() {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width - 44, 390);
  const [routineStarted, setRoutineStarted] = useState(false);
  const activeExercise = exercises[0];

  const [screen, setScreen] = useState('routine');
  const [isRunning, setIsRunning] = useState(false);
  const [currentSet, setCurrentSet] = useState(1);
  const [timerCentiseconds, setTimerCentiseconds] = useState(
    getStartingTime(activeExercise)
  );  

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setTimerCentiseconds((currentTime) => {
        const nextTime =
          activeExercise.type === 'countdown'
            ? currentTime - 1
            : currentTime + 1;

        if (activeExercise.type === 'countdown' && nextTime <= 0) {
          setIsRunning(false);
          return 0;
        }

        return nextTime;
      });
    }, 10);

    return () => clearInterval(timer);
  }, [isRunning, activeExercise.type]);

  function startExercise() {
    setTimerCentiseconds(getStartingTime(activeExercise));
    setCurrentSet(1);
    setIsRunning(true);
    setScreen('exercise');
  }

  function goToNextSet() {
    setCurrentSet((set) =>
      Math.min(set + 1, activeExercise.sets)
    );

    setTimerCentiseconds(getStartingTime(activeExercise));
    setIsRunning(true);
  }

  function resumeExercise() {
    setIsRunning(true);
  }

  if (screen === 'exercise') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.exerciseScreen}>
          <Text style={styles.encouragementText}>you got this!</Text>

          <View style={styles.exercisePageCard}>
            <View style={styles.exercisePageHeader}>
              <Text style={styles.exercisePageTitle}>
                {activeExercise.name}
              </Text>
            </View>

            <View style={styles.exercisePageContent}>
              <Text style={styles.timerText}>
                {formatTimer(timerCentiseconds)}
              </Text>

              <View style={styles.exerciseInfoPill}>
                <Text style={styles.exerciseInfoText}>
                  Set {currentSet} of {activeExercise.sets}
                </Text>
              </View>

              <View style={styles.exerciseInfoPill}>
                <Text style={styles.exerciseInfoText}>
                  {activeExercise.reps} Reps
                </Text>
              </View>

              <View style={styles.exerciseControls}>
                {isRunning ? (
                  <Pressable
                    style={styles.stopButton}
                    onPress={() => setIsRunning(false)}
                  >
                    <Text style={styles.stopButtonText}>STOP</Text>
                  </Pressable>
                ) : (
                  <View style={styles.controlRow}>
                    <Pressable
                      style={styles.controlButton}
                      onPress={goToNextSet}
                    >
                      <Text style={styles.controlButtonText}>NEXT</Text>
                    </Pressable>

                    <Pressable
                      style={styles.controlButton}
                      onPress={resumeExercise}
                    >
                      <Text style={styles.controlButtonText}>RESUME</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

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
          onPress={() => {
            if (!routineStarted) {
              setRoutineStarted(true);
            } else {
              startExercise();
            }
          }}
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
  exerciseScreen: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 20,
  },
  encouragementText: {
    color: palette.ink,
    fontFamily: 'serif',
    fontSize: 25,
    fontStyle: 'italic',
    marginBottom: 14,
    textAlign: 'center',
  },
  exercisePageCard: {
    backgroundColor: palette.blue,
    borderColor: palette.ink,
    borderRadius: 22,
    borderWidth: 1.8,
    flex: 1,
    overflow: 'hidden',
  },
  exercisePageHeader: {
    alignItems: 'center',
    backgroundColor: palette.orange,
    borderBottomColor: palette.ink,
    borderBottomWidth: 1.5,
    minHeight: 58,
    justifyContent: 'center',
  },
  exercisePageTitle: {
    color: palette.white,
    fontFamily: 'serif',
    fontSize: 28,
    fontStyle: 'italic',
  },
  exercisePageContent: {
    backgroundColor: palette.teal,
    borderColor: palette.ink,
    borderRadius: 20,
    borderWidth: 1.5,
    flex: 1,
    margin: 12,
    paddingHorizontal: 18,
    paddingTop: 30,
    paddingBottom: 12,
  },
  timerText: {
    color: palette.white,
    fontFamily: 'sans-serif-condensed',
    fontSize: 54,
    fontWeight: '900',
    textAlign: 'center',
  },
  exerciseInfoPill: {
    alignSelf: 'center',
    backgroundColor: palette.orange,
    borderColor: palette.ink,
    borderRadius: 28,
    borderWidth: 1.5,
    marginTop: 16,
    minWidth: 184,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  exerciseInfoText: {
    color: palette.white,
    fontFamily: 'serif',
    fontSize: 23,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  exerciseControls: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  stopButton: {
    alignItems: 'center',
    backgroundColor: palette.orange,
    borderColor: palette.ink,
    borderRadius: 20,
    borderWidth: 1.6,
    minHeight: 78,
    justifyContent: 'center',
  },
  stopButtonText: {
    color: palette.white,
    fontFamily: 'sans-serif-condensed',
    fontSize: 28,
    fontWeight: '900',
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  controlButton: {
    alignItems: 'center',
    backgroundColor: palette.orange,
    borderColor: palette.ink,
    borderRadius: 18,
    borderWidth: 1.5,
    flex: 1,
    marginHorizontal: 5,
    minHeight: 70,
    justifyContent: 'center',
  },
  controlButtonText: {
    color: palette.white,
    fontFamily: 'sans-serif-condensed',
    fontSize: 20,
    fontWeight: '900',
  },
});
