import TutorialScreenshot from './TutorialScreenshot';
import React, { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, TextInput, View } from 'react-native';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Text from './AppText';
import { useAppTheme } from './AppTheme';

const tutorials = [
  { title: 'Find your way around', screenshot: require('../assets/tutorials/home.png'), caption: 'Home shows your routine, progress, and help shortcut.', steps: ['Home shows today’s routine, your progress, and messages. Pull down on Home to refresh.', 'Use the bottom navigation to open your routines or messages and to start or resume your routine.', 'Tap your profile picture for your profile. Tap the question mark beside it to return to these tutorials anytime.'] },
  { title: 'Preview today’s and upcoming routines', screenshot: require('../assets/tutorials/routines.png'), caption: 'Preview your assigned exercises in Routines.', steps: ['Open Routines to review your assigned plan. Tap an exercise to see more information.', 'Check the sets, repetitions, or time and read your provider’s instructions before starting.', 'Expand an upcoming routine to preview its exercises. If no routine is assigned today, check upcoming routines or message your provider.'] },
  { title: 'Start, pause, and resume exercise', screenshot: require('../assets/tutorials/exercise.png'), caption: 'Pause, resume, and finish from the exercise controls.', steps: ['Use the start button in the bottom navigation or open today’s routine to begin.', 'Review the exercise introduction and demonstration, then start the exercise. Follow the displayed sets, repetitions, or timer.', 'Use the exercise controls to pause or resume. Advance through sets and exercises with the next controls when you are ready.', 'If you leave the exercise screen, use Resume to continue your in-progress routine.'] },
  { title: 'Share feedback and finish a routine', screenshot: require('../assets/tutorials/feedback.png'), caption: 'Share your pain level and how the exercise felt.', steps: ['After an exercise, complete the feedback prompts. Report how it felt, your pain level, and any explanation requested.', 'Save your feedback to continue to the next exercise.', 'At the end, review the routine summary and submit the routine feedback. Return Home to see your progress.'] },
  { title: 'Message your provider', screenshot: require('../assets/tutorials/messages.png'), caption: 'Read and reply to your care team.', steps: ['Open Messages from Home or the bottom navigation.', 'Select your provider conversation, write a message, and send it.', 'If no conversation is available, ask your provider to check your care connection. If sending fails, check the error and retry.'] },
  { title: 'Profile and account access', screenshot: require('../assets/tutorials/profile.png'), caption: 'Open your profile and account settings.', steps: ['Tap your profile picture on Home to view your profile and available settings.', 'Review your care details. Ask your provider to correct personal or care information managed by them.', 'Use the lock icon on Home when you want to lock the app. Follow the unlock prompts to return.'] },
  { title: 'Missing routines or connection problems', screenshot: require('../assets/tutorials/home.png'), caption: 'Refresh Home to check your current routine and messages.', steps: ['Pull down on Home to refresh routines and messages.', 'If no routine is scheduled today, review upcoming routines or message your provider about your plan.', 'If loading or feedback submission fails, check your connection and use the retry option. Wait for a successful save before moving on.'] },
];

export default function TutorialScreen({ onBack }) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(tutorials[0].title);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => subscription.remove();
  }, [onBack]);
  const matches = tutorials.filter(topic => `${topic.title} ${topic.steps.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ width: '92%', maxWidth: 720, alignSelf: 'center', paddingVertical: 20, gap: 16 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to home" onPress={onBack} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}><ArrowLeft aria-hidden={true} color={colors.primary} size={22} /><Text style={{ color: colors.primary, fontWeight: '700' }}>Back to home</Text></Pressable>
    <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 28, fontWeight: '800' }}>Help &amp; tutorials</Text>
    <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 23 }}>New to Milestone or need a refresher? Choose a topic for a step-by-step guide.</Text>
    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>Screenshots use sample data. Tap an image to enlarge it.</Text>
    <Text style={{ color: colors.text, fontWeight: '700' }}>Search tutorials</Text>
    <TextInput accessibilityLabel="Search tutorials" placeholder="Try routines, feedback, or messages" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} autoCapitalize="none" style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text, backgroundColor: colors.surface }} />
    {matches.map(topic => <View key={topic.title} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 14 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === topic.title }} aria-expanded={expanded === topic.title} onPress={() => setExpanded(expanded === topic.title ? null : topic.title)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '700' }}>{topic.title}</Text><ChevronDown aria-hidden={true} size={22} color={colors.primary} style={{ transform: [{ rotate: expanded === topic.title ? '180deg' : '0deg' }] }} /></Pressable>
      {expanded === topic.title && <>{topic.steps.map((step, index) => <Text key={step} style={{ color: colors.text, fontSize: 15, lineHeight: 24 }}>{index + 1}. {step}</Text>)}<TutorialScreenshot source={topic.screenshot} caption={topic.caption} /></>}
    </View>)}
    {!matches.length && <Text accessibilityRole="alert" style={{ color: colors.text }}>No tutorials found. Try another word or clear your search.</Text>}
  </ScrollView>;
}
