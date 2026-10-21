import { useAppTheme, useThemedStyles } from './components/AppTheme';
import { PatientSessionProvider } from './auth/PatientSession';
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import { Montserrat_400Regular } from '@expo-google-fonts/montserrat/400Regular';
import { Montserrat_500Medium } from '@expo-google-fonts/montserrat/500Medium';
import { Montserrat_600SemiBold } from '@expo-google-fonts/montserrat/600SemiBold';
import { Montserrat_700Bold } from '@expo-google-fonts/montserrat/700Bold';
import { Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat/800ExtraBold';
import Text, { AppFontsContext } from './components/AppText';
import Brand from './components/Brand';
import ProfileAvatar from './components/ProfileAvatar';
import UnlockGate from './components/UnlockGate';
import EasterEggSelector from './components/EasterEggSelector';
import LockKeyhole from 'lucide-react-native/icons/lock-keyhole';
import ClipboardClock from 'lucide-react-native/icons/clipboard-clock';
import House from 'lucide-react-native/icons/house';
import MessageSquare from 'lucide-react-native/icons/message-square';
import Play from 'lucide-react-native/icons/play';
import RotateCcw from 'lucide-react-native/icons/rotate-ccw';
import Info from 'lucide-react-native/icons/info';

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
    estimatedSeconds: 180,
    overview:
      'A simple upper-body exercise that strengthens your chest, shoulders, and arms. Keep your body straight and move at a comfortable pace.',
  },
  {
    name: 'Sit Ups',
    detail: 'Core strength',
    accent: '#91C6C1',
    type: 'countup',
    sets: 3,
    reps: 5,
    estimatedSeconds: 180,
    overview:
      'A core-strengthening exercise that works your abdominal muscles. Move slowly and avoid pulling on your neck.',
  },
  {
    name: 'Quad Stretch',
    detail: 'Flexibility',
    accent: '#98CCC5',
    type: 'countdown',
    durationSeconds: 30,
    sets: 1,
    reps: 1,
    overview:
      'A lower-body stretch that helps improve flexibility in the front of your thigh.',
  },
  {
    name: 'Leg Stretch',
    detail: 'Lower body',
    accent: '#A0D1C9',
    type: 'countdown',
    durationSeconds: 30,
    sets: 1,
    reps: 1,
    overview:
      'A gentle stretch for the legs that helps improve mobility and flexibility.',
  },
].map((exercise) => ({
  ...exercise,
  estimatedSeconds:
    exercise.durationSeconds ?? exercise.estimatedSeconds,
}));

const totalRoutineSeconds = exercises.reduce(
  (total, exercise) => total + exercise.estimatedSeconds,
  0
);

const routineMinutes = Math.ceil(totalRoutineSeconds / 60);

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
  // Load the custom typeface in the background. A native font load must not
  // keep the unlock screen (and its PIN input) hidden behind a spinner.
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  });
  const { width, height } = useWindowDimensions();
  const initialMetrics = initialWindowMetrics ?? {
    frame: { x: 0, y: 0, width, height },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  };

  return (
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <AppFontsContext.Provider value={fontsLoaded}>
        <PatientSessionProvider>
        <UnlockGate>
          {({ unlocked, onLock, profile, onOpenProfile }) => <AppContent isUnlocked={unlocked} onLock={onLock} profile={profile} onOpenProfile={onOpenProfile} />}
        </UnlockGate>
        </PatientSessionProvider>
      </AppFontsContext.Provider>
    </SafeAreaProvider>
  );
}

function AppContent({ isUnlocked, onLock, profile, onOpenProfile }) {
  const styles = useThemedStyles(baseStyles);
  const { colors, barStyle } = useAppTheme();
  const { width } = useWindowDimensions();
  const [routineStarted, setRoutineStarted] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const activeExercise = exercises[currentExerciseIndex];

  const [screen, setScreen] = useState('home');
  const [routineScreen, setRoutineScreen] = useState('exerciseIntro');
  const [expandedExerciseIndex, setExpandedExerciseIndex] = useState(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [currentSet, setCurrentSet] = useState(1);
  const [reviewRating, setReviewRating] = useState(null);

  const [completedExerciseIndices, setCompletedExerciseIndices] = useState([]);
  const completedExerciseCount = completedExerciseIndices.length;
  const routineComplete = routineScreen === 'finalReview';
  const routineActionLabel = routineComplete
    ? 'Start again'
    : routineStarted
      ? 'Resume'
      : 'Start';

  const [timerCentiseconds, setTimerCentiseconds] = useState(
    getStartingTime(activeExercise)
  );

  useEffect(() => {
    let disposed = false;
    let preferenceChanged = false;
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (!disposed && !preferenceChanged) setReduceMotion(value);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      preferenceChanged = true;
      setReduceMotion(value);
    });
    return () => { disposed = true; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!isRunning || !isUnlocked) return;

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
  }, [isRunning, activeExercise.type, isUnlocked]);

  useEffect(() => {
    if (!isUnlocked) setIsRunning(false);
  }, [isUnlocked]);

  function showRoutineScreen(nextScreen) {
    setRoutineScreen(nextScreen);
    setScreen(nextScreen);
  }

  function startExercise() {
    setRoutineStarted(true);
    setTimerCentiseconds(getStartingTime(activeExercise));
    setCurrentSet(1);
    setIsRunning(true);
    showRoutineScreen('exercise');
  }

  function goToNextSet() {
    setCurrentSet((set) =>
      Math.min(set + 1, activeExercise.sets)
    );

    setTimerCentiseconds(getStartingTime(activeExercise));
    setIsRunning(true);
  }

  function finishExercise() {
    setIsRunning(false);

    setCompletedExerciseIndices((indices) =>
      indices.includes(currentExerciseIndex)
        ? indices
        : [...indices, currentExerciseIndex]
    );

    setReviewRating(null);
    showRoutineScreen('review');
  }

  function goToNextExercise() {
    const isLastExercise =
      currentExerciseIndex >= exercises.length - 1;

    if (isLastExercise) {
      setReviewRating(null);
      showRoutineScreen('finalReview');
      return;
    }

    const nextIndex = currentExerciseIndex + 1;

    setCurrentExerciseIndex(nextIndex);
    setCurrentSet(1);
    setIsRunning(false);
    setReviewRating(null);
    setTimerCentiseconds(getStartingTime(exercises[nextIndex]));
    setRoutineStarted(true);
    showRoutineScreen('exerciseIntro');
  }

  function resumeExercise() {
    setIsRunning(true);
  }

  function goHome() {
    setScreen('home');
    setIsRunning(false);
  }

  function openRoutines() {
    setIsRunning(false);
    setScreen('routine');
  }

  function openMessages() {
    setIsRunning(false);
    setScreen('messages');
  }

  function startRoutineFromDock() {
    if (routineStarted && !routineComplete) {
      resumeRoutine();
      return;
    }

    setRoutineStarted(true);
    setCurrentExerciseIndex(0);
    setCurrentSet(1);
    setCompletedExerciseIndices([]);
    setExpandedExerciseIndex(null);
    setReviewRating(null);
    setTimerCentiseconds(getStartingTime(exercises[0]));
    setIsRunning(false);
    showRoutineScreen('exerciseIntro');
  }

  function resumeRoutine() {
    setIsRunning(
      routineScreen === 'exercise' &&
        (activeExercise.type !== 'countdown' || timerCentiseconds > 0)
    );
    setScreen(routineScreen);
  }

  function viewSummary() {
    setIsRunning(false);
    setScreen('finalReview');
  }

  function renderDock(activeTab = null) {
    return (
      <BottomDock
        activeTab={activeTab}
        onHome={goHome}
        onRoutines={openRoutines}
        onMessages={openMessages}
        onStartRoutine={startRoutineFromDock}
        routineActionLabel={routineActionLabel}
        enabled={isUnlocked}
        onRevealEasterEgg={() => setIsRunning(false)}
      />
    );
  }

  if (screen === 'exercise') {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={styles.exerciseScreen}
        >
          <Text style={styles.encouragementText}>you got this!</Text>

          <View style={styles.exercisePageCard}>
            <View style={styles.exercisePageHeader}>
              <Text style={styles.exercisePageTitle}>
                {activeExercise.name}
              </Text>
            </View>

            <View style={styles.exercisePageContent}>
              <Text
                testID="exercise-timer"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
                style={[
                  styles.timerText,
                  { color: palette.white, fontSize: Math.min(64, width * 0.125) },
                ]}
              >
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

              <View style={styles.exerciseInstructions}>
                <Text accessibilityRole="header" style={styles.exerciseInstructionsTitle}>
                  How to do it
                </Text>
                <Text style={styles.exerciseInstructionsText}>
                  {activeExercise.overview}
                </Text>
              </View>

              <View style={styles.exerciseControls}>
                {isRunning ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Pause exercise"
                    style={styles.stopButton}
                    onPress={() => setIsRunning(false)}
                  >
                    <Text style={styles.stopButtonText}>STOP</Text>
                  </Pressable>
                ) : (
                  <View style={styles.controlRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        currentSet >= activeExercise.sets
                          ? 'Finish exercise'
                          : 'Next set'
                      }
                      style={styles.controlButton}
                      onPress={
                        currentSet >= activeExercise.sets
                          ? finishExercise
                          : goToNextSet
                      }
                    >
                      <Text style={styles.controlButtonText}>
                        {currentSet >= activeExercise.sets ? 'FINISH' : 'NEXT'}
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Resume exercise"
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
        </ScrollView>
        {renderDock()}
      </SafeAreaView>
    );
  }

  if (screen === 'messages') {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={styles.messagesScreen}
        >
          <View style={styles.topRow}>
            <Brand />
          </View>
          <Text style={styles.messagesTitle}>Messages</Text>
          <View style={styles.messagesEmptyState}>
            <Text style={styles.messagesEmptyTitle}>You're all caught up</Text>
            <Text style={styles.messagesEmptyText}>
              Messages from your care team will appear here.
            </Text>
          </View>
        </ScrollView>
        {renderDock('messages')}
      </SafeAreaView>
    );
  }

  if (screen === 'finalReview') {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={styles.finalSummaryScreen}
        >
          <Text style={styles.reviewTitle}>ROUTINE COMPLETE!</Text>

          <Text style={styles.reviewSubtitle}>
            Here's what you accomplished today
          </Text>

          <View style={styles.finalSummaryCard}>
            <Text style={styles.reviewCardTitle}>YOUR SUMMARY</Text>

            {exercises.map((exercise) => (
              <View
                key={exercise.name}
                style={styles.finalSummaryRow}
              >
                <Text style={styles.summaryLabel}>
                  {exercise.name}
                </Text>

                <Text style={styles.summaryValue}>
                  {exercise.sets}{' '}
                  {exercise.sets === 1 ? 'set' : 'sets'}
                  {' · '}
                  {exercise.type === 'countdown'
                    ? `${exercise.durationSeconds}s`
                    : `${exercise.reps} reps`}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.feelingQuestion}>
            How did that feel overall?
          </Text>

          <View style={styles.feelingRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Routine felt good"
              aria-selected={reviewRating === 'up'}
              accessibilityState={{ selected: reviewRating === 'up' }}
              style={[
                styles.feelingButton,
                reviewRating === 'up' &&
                  styles.selectedFeelingButton,
              ]}
              onPress={() => setReviewRating('up')}
            >
              <Text style={styles.feelingEmoji}>👍</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Routine felt difficult"
              aria-selected={reviewRating === 'down'}
              accessibilityState={{ selected: reviewRating === 'down' }}
              style={[
                styles.feelingButton,
                reviewRating === 'down' &&
                  styles.selectedFeelingButton,
              ]}
              onPress={() => setReviewRating('down')}
            >
              <Text style={styles.feelingEmoji}>👎</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Return home"
            style={styles.reviewNextButton}
            onPress={goHome}
          >
            <Text style={styles.reviewNextButtonText}>HOME</Text>
          </Pressable>
        </ScrollView>
        {renderDock()}
      </SafeAreaView>
    );
  }

  if (screen === 'home') {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <StatusBar barStyle={barStyle} backgroundColor={colors.background} />
        <HomeDashboard
          onLock={onLock}
          onOpenProfile={onOpenProfile}
          profile={profile}
          completedExerciseCount={completedExerciseCount}
          routineStarted={routineStarted}
          routineComplete={routineComplete}
          onViewRoutine={openRoutines}
          onViewSummary={viewSummary}
          onMessages={openMessages}
        />
        {renderDock('home')}
      </SafeAreaView>
    );
  }

  if (screen === 'review') {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={styles.reviewScreen}
        >
          <Text style={styles.reviewTitle}>NICE WORK!</Text>

          <Text style={styles.reviewSubtitle}>
            You finished {activeExercise.name}
          </Text>

          <View style={styles.reviewCard}>
            <Text style={styles.reviewCardTitle}>YOUR SUMMARY</Text>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Exercise</Text>
              <Text style={styles.summaryValue}>
                {activeExercise.name}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Sets completed</Text>
              <Text style={styles.summaryValue}>
                {activeExercise.sets}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Reps per set</Text>
              <Text style={styles.summaryValue}>
                {activeExercise.reps}
              </Text>
            </View>
          </View>

          <Text style={styles.feelingQuestion}>
            How did that feel?
          </Text>

          <View style={styles.feelingRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Exercise felt good"
              aria-selected={reviewRating === 'up'}
              accessibilityState={{ selected: reviewRating === 'up' }}
              style={[
                styles.feelingButton,
                reviewRating === 'up' &&
                  styles.selectedFeelingButton,
              ]}
              onPress={() => setReviewRating('up')}
            >
              <Text style={styles.feelingEmoji}>👍</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Exercise felt difficult"
              aria-selected={reviewRating === 'down'}
              accessibilityState={{ selected: reviewRating === 'down' }}
              style={[
                styles.feelingButton,
                reviewRating === 'down' &&
                  styles.selectedFeelingButton,
              ]}
              onPress={() => setReviewRating('down')}
            >
              <Text style={styles.feelingEmoji}>👎</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next exercise"
            style={styles.reviewNextButton}
            onPress={goToNextExercise}
          >
            <Text style={styles.reviewNextButtonText}>NEXT</Text>
          </Pressable>
        </ScrollView>
        {renderDock()}
      </SafeAreaView>
    );
  }

  if (screen === 'exerciseIntro') {
    const upcomingExercises = exercises
      .map((exercise, index) => ({ exercise, index }))
      .filter(({ index }) =>
        index > currentExerciseIndex && !completedExerciseIndices.includes(index)
      );

    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <StatusBar barStyle={barStyle} backgroundColor={colors.background} />
        <ScrollView
          key={`exercise-intro-${currentExerciseIndex}`}
          style={styles.screenScroll}
          contentContainerStyle={styles.container}
        >
          <View style={styles.topRow}>
            <Brand />
            <ProfileAvatar profile={profile} onPress={onOpenProfile} />
          </View>

          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Up next</Text>
              <Text style={styles.sectionSubtitle}>
                Exercise {currentExerciseIndex + 1} of {exercises.length}
              </Text>
            </View>
            <View style={styles.progressBadge}>
              <Text style={styles.progressText}>
                {completedExerciseCount} / {exercises.length}
              </Text>
            </View>
          </View>

          <View style={styles.exerciseList}>
            <ExerciseInfo exercise={activeExercise} showTitle />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start exercise"
            onPress={startExercise}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>START EXERCISE</Text>
          </Pressable>

          {upcomingExercises.length > 0 && (
            <View style={styles.comingUpSection}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Coming up
              </Text>
              <View testID="upcoming-exercises" style={styles.exerciseList}>
                {upcomingExercises.map(({ exercise, index }, position) => (
                  <View
                    key={exercise.name}
                    style={[
                      styles.exerciseListItem,
                      position === upcomingExercises.length - 1 && styles.lastExercise,
                    ]}
                  >
                    <ExerciseRow exercise={exercise} index={index} />
                  </View>
                ))}
              </View>
            </View>
          )}

          <Text style={styles.footerText}>Move well. Feel better.</Text>
        </ScrollView>
        {renderDock('routines')}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle={barStyle} backgroundColor={colors.background} />

      <ScrollView
        key="routine-list"
        style={styles.screenScroll}
        contentContainerStyle={styles.container}
      >
        <View style={styles.topRow}>
          <Brand />
          <ProfileAvatar profile={profile} onPress={onOpenProfile} />
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>Today's routine</Text>
            <Text style={styles.sectionSubtitle}>
              {exercises.length} exercises · about {routineMinutes} minutes
            </Text>
          </View>
          <View style={styles.progressBadge}>
            <Text style={styles.progressText}>
              {completedExerciseCount} / {exercises.length}
            </Text>
          </View>
        </View>

        <View style={styles.exerciseList}>
          {exercises.map((exercise, index) => {
            const expanded = expandedExerciseIndex === index;
            return (
              <View
                key={exercise.name}
                style={[
                  styles.exerciseListItem,
                  index === exercises.length - 1 && styles.lastExercise,
                ]}
              >
                <ExerciseRow
                  exercise={exercise}
                  index={index}
                  expanded={expanded}
                  onPress={() => setExpandedExerciseIndex(expanded ? null : index)}
                />
                <AnimatedExerciseInfo
                  exercise={exercise}
                  expanded={expanded}
                  reduceMotion={reduceMotion}
                />
              </View>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            routineComplete
              ? 'View routine summary'
              : routineStarted
                ? 'Continue routine'
                : "Start today's routine"
          }
          onPress={routineComplete ? viewSummary : startRoutineFromDock}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {routineComplete
              ? 'VIEW SUMMARY'
              : routineStarted
                ? 'CONTINUE ROUTINE'
                : 'START ROUTINE'}
          </Text>

          
        </Pressable>

        <Text style={styles.footerText}>Move well. Feel better.</Text>
      </ScrollView>
      {renderDock('routines')}
    </SafeAreaView>
  );
}

function ExerciseRow({ exercise, index, onPress, expanded = false }) {
  const styles = useThemedStyles(baseStyles);
  const { colors, mode } = useAppTheme();
  const Row = onPress ? Pressable : View;
  const rowStyle = [
    styles.exerciseRow,
    { backgroundColor: mode === 'dark' ? colors.raised : exercise.accent },
    index === 0 && styles.firstExercise,
  ];

  return (
    <Row
      {...(onPress ? {
        onPress,
        accessibilityRole: 'button',
        accessibilityLabel: `${exercise.name} information`,
        accessibilityHint: expanded ? 'Collapse exercise information' : 'Expand exercise information',
        accessibilityState: { expanded },
        'aria-expanded': expanded,
      } : {})}
      style={onPress
        ? ({ pressed }) => [rowStyle, pressed && styles.primaryButtonPressed]
        : rowStyle}
    >
      <View style={styles.exerciseNumber}>
        <Text style={styles.exerciseNumberText}>{index + 1}</Text>
      </View>
      <View style={styles.exerciseCopy}>
        <Text style={styles.listTitle}>{exercise.name}</Text>
        <Text style={styles.listSubtitle}>{exercise.detail}</Text>
      </View>
      {onPress && (
        <Text style={[styles.chevron, expanded && styles.expandedChevron]}>›</Text>
      )}
    </Row>
  );
}

function AnimatedExerciseInfo({ exercise, expanded, reduceMotion }) {
  const styles = useThemedStyles(baseStyles);
  const height = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(expanded);
  const [contentHeight, setContentHeight] = useState(0);
  const targetHeight = expanded ? contentHeight : 0;

  useEffect(() => {
    if (expanded && !visible) {
      setVisible(true);
      return;
    }
    if (!visible) return;
    if (reduceMotion) {
      height.setValue(targetHeight);
      setVisible(expanded);
      return;
    }
    const animation = Animated.timing(height, {
      toValue: targetHeight,
      duration: 260,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && !expanded) setVisible(false);
    });
    return () => animation.stop();
  }, [expanded, visible, targetHeight, reduceMotion, height]);

  return (
    <Animated.View
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      aria-hidden={!expanded}
      pointerEvents={expanded ? 'auto' : 'none'}
      style={[styles.exercisePreview, !reduceMotion && { height }]}
    >
      {reduceMotion ? expanded && <ExerciseInfo exercise={exercise} /> : visible && (
        <View
          style={styles.exercisePreviewContent}
          onLayout={({ nativeEvent: { layout } }) => setContentHeight(Math.ceil(layout.height))}
        >
          <ExerciseInfo exercise={exercise} />
        </View>
      )}
    </Animated.View>
  );
}

function ExerciseInfo({ exercise, showTitle = false }) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useAppTheme();

  return (
    <View style={styles.expandedExercise}>
      {showTitle && (
        <View style={styles.expandedHeader}>
          <Text accessibilityRole="header" style={styles.expandedHeaderText}>
            {exercise.name}
          </Text>
        </View>
      )}
      <View style={styles.overviewPanel}>
        <View style={styles.infoIcon}>
          <Info size={26} color={colors.text} accessible={false} />
        </View>
        <Text style={styles.overviewText}>{exercise.overview}</Text>
      </View>
      <View style={styles.statsRow}>
        <Text style={styles.statsText}>
          {exercise.sets} {exercise.sets === 1 ? 'Set' : 'Sets'}
        </Text>
        <Text style={styles.statsText}>
          {exercise.type === 'countdown'
            ? `${exercise.durationSeconds} Seconds`
            : `${exercise.reps} Reps`}
        </Text>
      </View>
    </View>
  );
}

function HomeDashboard({
  onOpenProfile,
  onLock,
  profile,
  completedExerciseCount,
  routineStarted,
  routineComplete,
  onViewRoutine,
  onViewSummary,
  onMessages,
}) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useAppTheme();
  const displayName = profile?.preferredName || profile?.fullName?.split(' ')[0] || 'Frank';
  const progressPercent = Math.round(
    (completedExerciseCount / exercises.length) * 100
  );
  const progressStatus = routineComplete
    ? 'Complete'
    : routineStarted
      ? 'In progress'
      : 'Not started';
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <ScrollView
      style={styles.screenScroll}
      contentContainerStyle={styles.dashboardContent}
    >
      <View style={styles.topRow}>
        <Brand />
        <View style={styles.profileActions}>
          {onLock && <Pressable accessibilityRole="button" accessibilityLabel="Lock Milestone" onPress={onLock} style={styles.lockButton}>
            <LockKeyhole size={21} color={colors.primary} accessible={false} />
          </Pressable>}
          <ProfileAvatar profile={profile} onPress={onOpenProfile} />
        </View>
      </View>

      <View style={[styles.dashboardGreeting, styles.welcomeCard]}>
        <Text style={styles.dashboardDate}>{today}</Text>
        <Text accessibilityRole="header" style={styles.welcomeTitle}>
          Welcome back, {displayName}.
        </Text>
        <View style={styles.welcomeRule} />
        <Text style={styles.welcomeSubtext}>Here's your day at a glance.</Text>
      </View>

      <View style={[styles.dashboardCard, styles.dashboardRoutineCard]}>
        <Text style={styles.dashboardEyebrow}>YOUR DAILY PLAN</Text>
        <Text accessibilityRole="header" style={styles.dashboardCardTitle}>
          Today's routine
        </Text>
        <Text style={styles.dashboardBody}>
          A little movement, one step at a time.
        </Text>
        <View style={styles.dashboardRoutineStats}>
          <View>
            <Text style={styles.dashboardStatValue}>{exercises.length}</Text>
            <Text style={styles.dashboardStatLabel}>exercises</Text>
          </View>
          <View>
            <Text style={styles.dashboardStatValue}>{routineMinutes} min</Text>
            <Text style={styles.dashboardStatLabel}>estimated time</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onViewRoutine}
          style={({ pressed }) => [
            styles.dashboardPrimaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.dashboardPrimaryButtonText}>View routine</Text>
        </Pressable>
      </View>

      <View style={styles.dashboardCard}>
        <View style={styles.dashboardCardHeading}>
          <Text accessibilityRole="header" style={styles.dashboardCardTitle}>
            Today's progress
          </Text>
          <View style={styles.dashboardStatus}>
            <Text style={styles.dashboardStatusText}>{progressStatus}</Text>
          </View>
        </View>
        <Text style={styles.dashboardProgressCount}>
          {completedExerciseCount} of {exercises.length} exercises complete
        </Text>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Today's exercise progress"
          aria-valuemin={0}
          aria-valuemax={exercises.length}
          aria-valuenow={completedExerciseCount}
          aria-valuetext={`${progressPercent}% complete`}
          style={styles.dashboardProgressTrack}
        >
          <View
            style={[
              styles.dashboardProgressFill,
              { width: `${progressPercent}%` },
            ]}
          />
        </View>
        <Text style={styles.dashboardBody}>{progressPercent}% complete</Text>
        {routineComplete && (
          <Pressable
            accessibilityRole="button"
            onPress={onViewSummary}
            style={styles.dashboardTextButton}
          >
            <Text style={styles.dashboardTextButtonLabel}>View summary</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.dashboardCard}>
        <Text accessibilityRole="header" style={styles.dashboardCardTitle}>
          Messages
        </Text>
        <Text style={styles.dashboardMessageTitle}>No new messages</Text>
        <Text style={styles.dashboardBody}>
          Messages from your care team will appear here.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onMessages}
          style={styles.dashboardTextButton}
        >
          <Text style={styles.dashboardTextButtonLabel}>View messages</Text>
        </Pressable>
      </View>
      <Text style={styles.dashboardFooter}>Move well. Feel better.</Text>
    </ScrollView>
  );
}

function BottomDock({
  activeTab,
  onHome,
  onRoutines,
  onMessages,
  onStartRoutine,
  routineActionLabel,
  enabled,
  onRevealEasterEgg,
}) {
  const styles = useThemedStyles(baseStyles);
  const activePalette = useAppTheme().palette || palette;
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const homeWasHeld = useRef(false);

  useEffect(() => {
    if (!enabled) setShowEasterEgg(false);
  }, [enabled]);

  const RoutineActionIcon = routineActionLabel === 'Start again' ? RotateCcw : Play;
  const items = [
    { id: 'home', label: 'Home', icon: House, onPress: onHome },
    { id: 'routines', label: 'Routines', icon: ClipboardClock, onPress: onRoutines },
    { id: 'messages', label: 'Messages', icon: MessageSquare, onPress: onMessages },
  ];

  return (
    <>
      <SafeAreaView edges={['bottom']} style={styles.dock}>
        <View style={styles.dockContent}>
          {items.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;

            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                aria-selected={isActive}
                accessibilityState={{ selected: isActive }}
                onPressIn={item.id === 'home' ? () => { homeWasHeld.current = false; } : undefined}
                delayLongPress={item.id === 'home' ? 3000 : undefined}
                onLongPress={item.id === 'home' ? () => {
                  if (!enabled) return;
                  homeWasHeld.current = true;
                  onRevealEasterEgg();
                  setShowEasterEgg(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                } : undefined}
                onPress={() => {
                  if (item.id === 'home' && homeWasHeld.current) {
                    homeWasHeld.current = false;
                    return;
                  }
                  item.onPress();
                }}
                style={styles.dockItem}
              >
                <Icon
                  accessible={false}
                  size={22}
                  color={isActive ? activePalette.tealDark : activePalette.ink}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <Text
                  style={[
                    styles.dockLabel,
                    isActive && styles.dockActiveText,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              routineActionLabel === 'Start again'
                ? 'Start routine again'
                : `${routineActionLabel} routine`
            }
            onPress={onStartRoutine}
            style={({ pressed }) => [
              styles.dockStartItem,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <RoutineActionIcon
              accessible={false}
              size={22}
              color={activePalette.white}
              strokeWidth={2}
            />
            <Text style={styles.dockStartLabel}>{routineActionLabel}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
      {showEasterEgg && enabled && <EasterEggSelector onClose={() => setShowEasterEgg(false)} />}
    </>
  );
}

// Percentage widths provide consistent gutters; cap reading width on tablets.
const pageLayout = {
  width: '92%',
  maxWidth: 720,
  alignSelf: 'center',
  flexGrow: 1,
  paddingVertical: 20,
};

const baseStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.cream,
  },
  container: {
    ...pageLayout,
  },
  screenScroll: {
    flex: 1,
  },
  messagesScreen: {
    ...pageLayout,
  },
  messagesTitle: {
    color: palette.ink,
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 24,
  },
  messagesEmptyState: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.tealDark,
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: '6%',
    paddingVertical: 28,
  },
  messagesEmptyTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  messagesEmptyText: {
    color: palette.tealDark,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  dock: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderTopColor: 'rgba(25, 51, 51, 0.16)',
    borderTopWidth: 1,
  },
  dockContent: {
    width: '96%',
    maxWidth: 720,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 7,
    gap: '1%',
  },
  dockItem: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
    minWidth: 0,
    paddingVertical: 6,
  },
  dockLabel: {
    color: palette.ink,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
    textAlign: 'center',
    flexShrink: 1,
  },
  dockActiveText: {
    color: palette.tealDark,
    fontWeight: '800',
  },
  dockStartItem: {
    alignItems: 'center',
    backgroundColor: palette.orange,
    borderColor: palette.ink,
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    marginHorizontal: 3,
    minHeight: 54,
    minWidth: 0,
    paddingVertical: 6,
  },
  dockStartLabel: {
    color: palette.white,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
    textAlign: 'center',
    flexShrink: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    flexWrap: 'wrap',
    gap: 12,
  },
  profileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
  },
  lockButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: palette.tealDark,
    fontSize: 11,
    letterSpacing: 2.4,
    marginBottom: 2,
  },
  welcomeCard: {
    backgroundColor: palette.orange,
    borderColor: palette.ink,
    borderRadius: 20,
    borderWidth: 1.8,
    elevation: 2,
    paddingHorizontal: '6%',
    paddingVertical: 17,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
  },
  welcomeTitle: {
    color: palette.white,
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
    fontSize: 18,
    marginTop: 9,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 11,
    marginTop: 30,
    flexWrap: 'wrap',
    gap: 10,
  },
  sectionCopy: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 23,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: palette.tealDark,
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
    fontSize: 12,
  },
  exerciseList: {
    borderColor: palette.ink,
    borderRadius: 20,
    borderWidth: 1.6,
    overflow: 'hidden',
  },
  exerciseListItem: {
    borderBottomColor: palette.ink,
    borderBottomWidth: 1.4,
  },
  exercisePreview: {
    overflow: 'hidden',
  },
  exercisePreviewContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  exerciseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 63,
    paddingHorizontal: '4%',
    paddingVertical: 12,
    gap: '3%',
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
    width: 30,
    flexShrink: 0,
  },
  exerciseNumberText: {
    color: palette.ink,
    fontSize: 13,
  },
  exerciseCopy: {
    flex: 1,
    minWidth: 0,
  },
  listTitle: {
    color: palette.ink,
    fontSize: 22,
  },
  listSubtitle: {
    color: palette.tealDark,
    fontSize: 11,
    marginTop: 1,
  },
  chevron: {
    color: palette.ink,
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
    opacity: 0.65,
  },
  expandedChevron: {
    transform: [{ rotate: '90deg' }],
  },
  comingUpSection: {
    marginTop: 28,
    gap: 14,
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
    paddingHorizontal: '4%',
    paddingVertical: 14,
  },
  primaryButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
  primaryButtonText: {
    color: palette.white,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.6,
    textAlign: 'center',
    flexShrink: 1,
  },
  primaryButtonIcon: {
    color: palette.white,
    fontSize: 24,
    marginLeft: 11,
  },
  footerText: {
    color: palette.tealDark,
    fontSize: 14,
    marginTop: 'auto',
    opacity: 0.85,
    textAlign: 'center',
    paddingTop: 18,
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
    paddingVertical: 12,
  },
  expandedHeaderText: {
    color: palette.white,
    fontSize: 27,
  },
  overviewPanel: {
    alignItems: 'center',
    backgroundColor: palette.teal,
    flexDirection: 'row',
    paddingHorizontal: '5%',
    paddingVertical: 24,
    flexWrap: 'wrap',
    gap: 16,
  },
  infoIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 247, 0.55)',
    borderColor: palette.ink,
    borderRadius: 26,
    borderWidth: 1.4,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  overviewText: {
    color: palette.ink,
    flexGrow: 1,
    flexBasis: '65%',
    minWidth: 0,
    fontSize: 17,
    lineHeight: 24,
  },
  statsRow: {
    alignItems: 'center',
    backgroundColor: palette.orange,
    borderTopColor: palette.ink,
    borderTopWidth: 1.4,
    flexDirection: 'row',
    justifyContent: 'space-around',
    minHeight: 56,
    flexWrap: 'wrap',
    gap: 12,
    padding: 12,
  },
  statsText: {
    color: palette.white,
    fontSize: 24,
  },
  exerciseScreen: {
    ...pageLayout,
  },
  encouragementText: {
    color: palette.ink,
    fontSize: 25,
    marginBottom: 14,
    textAlign: 'center',
  },
  exercisePageCard: {
    backgroundColor: palette.blue,
    borderColor: palette.ink,
    borderRadius: 22,
    borderWidth: 1.8,
    flexGrow: 1,
    minHeight: 420,
    overflow: 'hidden',
  },
  exercisePageHeader: {
    alignItems: 'center',
    backgroundColor: palette.orange,
    borderBottomColor: palette.ink,
    borderBottomWidth: 1.5,
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: '4%',
    paddingVertical: 12,
  },
  exercisePageTitle: {
    color: palette.white,
    fontSize: 28,
    textAlign: 'center',
  },
  exercisePageContent: {
    backgroundColor: palette.teal,
    borderColor: palette.ink,
    borderRadius: 20,
    borderWidth: 1.5,
    flexGrow: 1,
    margin: '3%',
    paddingHorizontal: '5%',
    paddingTop: 30,
    paddingBottom: 12,
  },
  timerText: {
    color: palette.white,
    fontSize: 54,
    fontWeight: '900',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  exerciseInfoPill: {
    alignSelf: 'center',
    backgroundColor: palette.orange,
    borderColor: palette.ink,
    borderRadius: 28,
    borderWidth: 1.5,
    marginTop: 16,
    width: '76%',
    maxWidth: 360,
    paddingHorizontal: '3%',
    paddingVertical: 9,
  },
  exerciseInfoText: {
    color: palette.white,
    fontSize: 23,
    textAlign: 'center',
  },
  exerciseControls: {
    justifyContent: 'flex-end',
    paddingTop: 24,
  },
  exerciseInstructions: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 8,
    paddingTop: 24,
  },
  exerciseInstructionsTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  exerciseInstructionsText: {
    color: palette.ink,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
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
    fontSize: 28,
    fontWeight: '900',
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  controlButton: {
    alignItems: 'center',
    backgroundColor: palette.orange,
    borderColor: palette.ink,
    borderRadius: 18,
    borderWidth: 1.5,
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 70,
    justifyContent: 'center',
    paddingHorizontal: '3%',
    paddingVertical: 12,
  },
  controlButtonText: {
    color: palette.white,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    flexShrink: 1,
  },
  reviewScreen: {
    ...pageLayout,
  },
  reviewTitle: {
    color: palette.ink,
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  reviewSubtitle: {
    color: palette.tealDark,
    fontSize: 19,
    marginTop: 6,
    textAlign: 'center',
  },
  reviewCard: {
    backgroundColor: palette.teal,
    borderColor: palette.ink,
    borderRadius: 20,
    borderWidth: 1.5,
    marginTop: 32,
    paddingHorizontal: '5%',
    paddingVertical: 20,
  },
  reviewCardTitle: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 16,
  },
  summaryRow: {
    borderTopColor: 'rgba(25, 51, 51, 0.3)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13,
    flexWrap: 'wrap',
    gap: '4%',
  },
  summaryLabel: {
    color: palette.ink,
    fontSize: 15,
    flexBasis: '44%',
    flexGrow: 1,
    flexShrink: 1,
  },
  summaryValue: {
    color: palette.ink,
    fontSize: 17,
    flexBasis: '48%',
    flexGrow: 1,
    flexShrink: 1,
    textAlign: 'right',
  },
  feelingQuestion: {
    color: palette.ink,
    fontSize: 24,
    marginTop: 38,
    textAlign: 'center',
  },
  feelingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 18,
    flexWrap: 'wrap',
    gap: '6%',
    marginBottom: 24,
  },
  feelingButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.tealDark,
    borderRadius: 30,
    borderWidth: 1.5,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  selectedFeelingButton: {
    backgroundColor: palette.orange,
    borderColor: palette.ink,
  },
  feelingEmoji: {
    fontSize: 28,
  },
  reviewNextButton: {
    alignItems: 'center',
    backgroundColor: palette.blue,
    borderColor: palette.tealDark,
    borderRadius: 19,
    borderWidth: 1.5,
    justifyContent: 'center',
    marginTop: 'auto',
    minHeight: 66,
    paddingHorizontal: '4%',
    paddingVertical: 14,
  },
  reviewNextButtonText: {
    color: palette.white,
    fontSize: 22,
    fontWeight: '900',
  },
  finalSummaryScreen: {
    ...pageLayout,
  },
  finalSummaryCard: {
    backgroundColor: palette.teal,
    borderColor: palette.ink,
    borderRadius: 20,
    borderWidth: 1.5,
    marginTop: 28,
    paddingHorizontal: '5%',
    paddingVertical: 20,
  },
  finalSummaryRow: {
    borderTopColor: 'rgba(25, 51, 51, 0.3)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13,
    flexWrap: 'wrap',
    gap: '4%',
  },
  dashboardContent: {
    ...pageLayout,
  },
  dashboardGreeting: {
    marginBottom: 24,
  },
  dashboardDate: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  dashboardCard: {
    backgroundColor: palette.white,
    borderColor: 'rgba(25, 51, 51, 0.18)',
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: '5%',
    paddingVertical: 20,
  },
  dashboardRoutineCard: {
    backgroundColor: palette.teal,
    borderColor: palette.tealDark,
  },
  dashboardEyebrow: {
    color: palette.ink,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  dashboardCardTitle: {
    color: palette.ink,
    fontSize: 21,
    fontWeight: '700',
    flexShrink: 1,
  },
  dashboardBody: {
    color: palette.ink,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  dashboardRoutineStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: '10%',
    marginVertical: 20,
  },
  dashboardStatValue: {
    color: palette.ink,
    fontSize: 28,
    fontWeight: '800',
  },
  dashboardStatLabel: {
    color: palette.ink,
    fontSize: 13,
    marginTop: 3,
  },
  dashboardPrimaryButton: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dashboardPrimaryButtonText: {
    color: palette.white,
    fontSize: 15,
    fontWeight: '700',
  },
  dashboardCardHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  dashboardStatus: {
    backgroundColor: palette.cream,
    borderColor: palette.orange,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dashboardStatusText: {
    color: palette.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  dashboardProgressCount: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
  },
  dashboardProgressTrack: {
    backgroundColor: palette.cream,
    borderRadius: 6,
    height: 10,
    marginTop: 16,
    overflow: 'hidden',
  },
  dashboardProgressFill: {
    backgroundColor: palette.tealDark,
    borderRadius: 6,
    height: '100%',
  },
  dashboardMessageTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  dashboardTextButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  dashboardTextButtonLabel: {
    color: palette.tealDark,
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  dashboardFooter: {
    color: palette.tealDark,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
});
