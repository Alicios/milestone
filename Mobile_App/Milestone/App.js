import React, { useEffect, useState } from 'react';
import {
  Pressable,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

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

const modernFontFamily = Platform.select({
  android: 'sans-serif',
  ios: 'System',
  default: 'system-ui',
});

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
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width - 44, 390);
  const [routineStarted, setRoutineStarted] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const activeExercise = exercises[currentExerciseIndex];

  const [screen, setScreen] = useState('home');
  const [routineScreen, setRoutineScreen] = useState('routine');
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
    showRoutineScreen('routine');
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
    setReviewRating(null);
    setTimerCentiseconds(getStartingTime(exercises[0]));
    setIsRunning(true);
    showRoutineScreen('exercise');
  }

  function resumeRoutine() {
    if (routineScreen === 'routine') {
      startExercise();
      return;
    }

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
      />
    );
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
              <Text
                testID="exercise-timer"
                numberOfLines={1}
                style={[
                  styles.timerText,
                  width < 360 && styles.compactTimerText,
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
        </View>
        {renderDock()}
      </SafeAreaView>
    );
  }

  if (screen === 'messages') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.messagesScreen}>
          <Text style={styles.messagesTitle}>Messages</Text>
          <View style={styles.messagesEmptyState}>
            <Text style={styles.messagesEmptyTitle}>You're all caught up</Text>
            <Text style={styles.messagesEmptyText}>
              Messages from your care team will appear here.
            </Text>
          </View>
        </View>
        {renderDock('messages')}
      </SafeAreaView>
    );
  }

  if (screen === 'finalReview') {
    return (
      <SafeAreaView style={styles.safeArea}>
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
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={palette.cream} />
        <HomeDashboard
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
      <SafeAreaView style={styles.safeArea}>
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.cream} />

      <ScrollView
        style={styles.screenScroll}
        contentContainerStyle={[styles.container, { maxWidth: contentWidth }]}
      >
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
          {routineStarted && (
            <View style={styles.expandedExercise}>
              <View style={styles.expandedHeader}>
                <Text style={styles.expandedHeaderText}>
                  {activeExercise.name}
                </Text>
              </View>

              <View style={styles.overviewPanel}>
                <View style={styles.infoIcon}>
                  <Text style={styles.infoIconText}>(i)</Text>
                </View>

                <Text style={styles.overviewText}>
                  {activeExercise.overview}
                </Text>
              </View>

              <View style={styles.statsRow}>
                <Text style={styles.statsText}>
                  {activeExercise.sets} Sets
                </Text>

                <Text style={styles.statsText}>
                  {activeExercise.reps} Reps
                </Text>
              </View>
            </View>
          )}

          {exercises.map((exercise, index) => {
            if (routineStarted && index === currentExerciseIndex) {
              return null;
            }

            return (
              <View
                key={exercise.name}
                style={[
                  styles.exerciseRow,
                  { backgroundColor: exercise.accent },
                  !routineStarted &&
                    index === 0 &&
                    styles.firstExercise,
                  index === exercises.length - 1 &&
                    styles.lastExercise,
                ]}
              >
                <View style={styles.exerciseNumber}>
                  <Text style={styles.exerciseNumberText}>
                    {index + 1}
                  </Text>
                </View>

                <View style={styles.exerciseCopy}>
                  <Text style={styles.listTitle}>{exercise.name}</Text>
                  <Text style={styles.listSubtitle}>{exercise.detail}</Text>
                </View>

                <Text style={styles.chevron}>›</Text>
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
          onPress={() => {
            if (!routineStarted) {
              setRoutineStarted(true);
            } else {
              resumeRoutine();
            }
          }}
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

function HomeDashboard({
  completedExerciseCount,
  routineStarted,
  routineComplete,
  onViewRoutine,
  onViewSummary,
  onMessages,
}) {
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
        <Text style={styles.brand}>MILESTONE</Text>
        <View style={styles.avatar} accessibilityLabel="Frank's profile">
          <Text style={styles.avatarText}>F</Text>
        </View>
      </View>

      <View style={styles.dashboardGreeting}>
        <Text style={styles.dashboardDate}>{today}</Text>
        <Text accessibilityRole="header" style={styles.dashboardTitle}>
          Welcome back, Frank.
        </Text>
        <Text style={styles.dashboardSubtitle}>Here's your day at a glance.</Text>
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
}) {
  const items = [
    { id: 'home', label: 'Home', icon: '⌂', onPress: onHome },
    { id: 'routines', label: 'Routines', icon: '▤', onPress: onRoutines },
    { id: 'messages', label: 'Messages', icon: '✉', onPress: onMessages },
  ];

  return (
    <View style={styles.dock}>
      {items.map((item) => {
        const isActive = activeTab === item.id;

        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            aria-selected={isActive}
            accessibilityState={{ selected: isActive }}
            onPress={item.onPress}
            style={styles.dockItem}
          >
            <Text
              accessible={false}
              style={[
                styles.dockIcon,
                isActive && styles.dockActiveText,
              ]}
            >
              {item.icon}
            </Text>
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
        <Text accessible={false} style={styles.dockStartIcon}>
          ▶
        </Text>
        <Text style={styles.dockStartLabel}>{routineActionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.cream,
  },
  container: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 20,
  },
  screenScroll: {
    flex: 1,
  },
  messagesScreen: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 32,
  },
  messagesTitle: {
    color: palette.ink,
    fontFamily: modernFontFamily,
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
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  messagesEmptyTitle: {
    color: palette.ink,
    fontFamily: modernFontFamily,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  messagesEmptyText: {
    color: palette.tealDark,
    fontFamily: modernFontFamily,
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
    flexDirection: 'row',
    justifyContent: 'space-around',
    minHeight: 74,
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  dockItem: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
  },
  dockIcon: {
    color: palette.ink,
    fontFamily: modernFontFamily,
    fontSize: 21,
    fontWeight: '600',
    lineHeight: 25,
  },
  dockLabel: {
    color: palette.ink,
    fontFamily: modernFontFamily,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
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
  },
  dockStartIcon: {
    color: palette.white,
    fontFamily: modernFontFamily,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 21,
  },
  dockStartLabel: {
    color: palette.white,
    fontFamily: modernFontFamily,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  eyebrow: {
    color: palette.tealDark,
    fontFamily: modernFontFamily,
    fontSize: 11,
    letterSpacing: 2.4,
    marginBottom: 2,
  },
  brand: {
    color: palette.ink,
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
    fontSize: 23,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: palette.tealDark,
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
    fontSize: 13,
  },
  exerciseCopy: {
    flex: 1,
  },
  listTitle: {
    color: palette.ink,
    fontFamily: modernFontFamily,
    fontSize: 22,
    fontStyle: 'italic',
  },
  listSubtitle: {
    color: palette.tealDark,
    fontFamily: modernFontFamily,
    fontSize: 11,
    marginTop: 1,
  },
  chevron: {
    color: palette.ink,
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
    fontSize: 20,
    fontStyle: 'italic',
  },
  overviewText: {
    color: palette.ink,
    flex: 1,
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
    fontSize: 54,
    fontWeight: '900',
    textAlign: 'center',
  },
  compactTimerText: {
    fontSize: 40,
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
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
    fontSize: 20,
    fontWeight: '900',
  },
  reviewScreen: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 20,
  },
  reviewTitle: {
    color: palette.ink,
    fontFamily: modernFontFamily,
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  reviewSubtitle: {
    color: palette.tealDark,
    fontFamily: modernFontFamily,
    fontSize: 19,
    fontStyle: 'italic',
    marginTop: 6,
    textAlign: 'center',
  },
  reviewCard: {
    backgroundColor: palette.teal,
    borderColor: palette.ink,
    borderRadius: 20,
    borderWidth: 1.5,
    marginTop: 32,
    padding: 20,
  },
  reviewCardTitle: {
    color: palette.ink,
    fontFamily: modernFontFamily,
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
  },
  summaryLabel: {
    color: palette.ink,
    fontFamily: modernFontFamily,
    fontSize: 15,
  },
  summaryValue: {
    color: palette.ink,
    fontFamily: modernFontFamily,
    fontSize: 17,
    fontStyle: 'italic',
  },
  feelingQuestion: {
    color: palette.ink,
    fontFamily: modernFontFamily,
    fontSize: 24,
    fontStyle: 'italic',
    marginTop: 38,
    textAlign: 'center',
  },
  feelingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 18,
  },
  feelingButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.tealDark,
    borderRadius: 30,
    borderWidth: 1.5,
    height: 64,
    justifyContent: 'center',
    marginHorizontal: 10,
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
  },
  reviewNextButtonText: {
    color: palette.white,
    fontFamily: modernFontFamily,
    fontSize: 22,
    fontWeight: '900',
  },
  finalSummaryScreen: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 20,
  },
  finalSummaryCard: {
    backgroundColor: palette.teal,
    borderColor: palette.ink,
    borderRadius: 20,
    borderWidth: 1.5,
    marginTop: 28,
    padding: 20,
  },
  finalSummaryRow: {
    borderTopColor: 'rgba(25, 51, 51, 0.3)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  dashboardContent: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 24,
  },
  dashboardGreeting: {
    marginBottom: 24,
  },
  dashboardDate: {
    color: palette.tealDark,
    fontFamily: modernFontFamily,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  dashboardTitle: {
    color: palette.ink,
    fontFamily: modernFontFamily,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
  },
  dashboardSubtitle: {
    color: palette.ink,
    fontFamily: modernFontFamily,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  dashboardCard: {
    backgroundColor: palette.white,
    borderColor: 'rgba(25, 51, 51, 0.18)',
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 16,
    padding: 20,
  },
  dashboardRoutineCard: {
    backgroundColor: palette.teal,
    borderColor: palette.tealDark,
  },
  dashboardEyebrow: {
    color: palette.ink,
    fontFamily: modernFontFamily,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  dashboardCardTitle: {
    color: palette.ink,
    fontFamily: modernFontFamily,
    fontSize: 21,
    fontWeight: '700',
    flexShrink: 1,
  },
  dashboardBody: {
    color: palette.ink,
    fontFamily: modernFontFamily,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  dashboardRoutineStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 28,
    marginVertical: 20,
  },
  dashboardStatValue: {
    color: palette.ink,
    fontFamily: modernFontFamily,
    fontSize: 28,
    fontWeight: '800',
  },
  dashboardStatLabel: {
    color: palette.ink,
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
    fontSize: 11,
    fontWeight: '700',
  },
  dashboardProgressCount: {
    color: palette.ink,
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
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
    fontFamily: modernFontFamily,
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  dashboardFooter: {
    color: palette.tealDark,
    fontFamily: modernFontFamily,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
});
