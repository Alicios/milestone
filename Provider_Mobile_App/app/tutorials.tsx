import { TutorialScreenshot } from '../src/ui/TutorialScreenshot';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { Card, Field, Heading, Screen, Text } from '../src/ui/components';
import { useTheme } from '../src/ui/theme';

const tutorials = [
  { title: 'Start your daily review', screenshot: require('../assets/tutorials/home.png'), caption: 'Home highlights recent activity and care that needs attention.', steps: ['Open Home for activity from the last 7 days, including recent completions and routines that need attention.', 'Tap a reported issue or completion to open the patient and the relevant assignment. Read exercise feedback as well as the routine status.', 'Pull down on Home to refresh the overview. Open the question mark beside your profile picture whenever you need this guide.'] },
  { title: 'Find a patient and review care', screenshot: require('../assets/tutorials/patients.png'), caption: 'Search, filter, and sort your patients.', steps: ['Open Patients. Search by name, or use Filter and sorting to narrow the list.', 'Tap a patient, then Show patient details to read their care and contact information.', 'Use the calendar to select a day and inspect assigned routines, exercise results, and patient feedback.', 'Patient creation and personal or care detail edits are available on the provider website.'] },
  { title: 'Assign or change a routine', screenshot: require('../assets/tutorials/patient-calendar.png'), caption: 'Review a day and its assigned routine.', steps: ['Open a patient and select a date in their calendar.', 'Use the scheduling controls to choose an existing routine and review the dates before saving. Create or edit routine templates on the provider website.', 'Use Change routine or Remove routine on an eligible assignment. Review the confirmation before saving; started, completed, and past routines retain their care history.'] },
  { title: 'Message a patient', screenshot: require('../assets/tutorials/messages.png'), caption: 'Read and reply to a patient conversation.', steps: ['Open Messages and select a conversation, or choose Open conversation from a patient’s page.', 'Enter a message and send it. If sending fails, review the error and retry.', 'Return to Messages to switch conversations and check unread messages.'] },
  { title: 'Review archived patients', screenshot: require('../assets/tutorials/archive.png'), caption: 'Find discharged relationships in the patient archive.', steps: ['Open Patients and tap Archive to find discharged care relationships.', 'Select a patient to review their archived details and routines. Archived care is read only in the companion.', 'Use the provider website to manage discharge or reinstate a patient when care resumes.'] },
  { title: 'Manage your profile and app security', screenshot: require('../assets/tutorials/settings.png'), caption: 'Change appearance or lock your workspace.', steps: ['Tap your profile picture on Home to open your profile. Use the Profile menu in the bottom navigation to open App settings.', 'Change appearance in App settings. Manage your password and authenticator on the provider website.', 'Use Lock workspace to lock immediately, or Sign out on this device when you finish. The workspace also locks when you leave the app.'] },
  { title: 'Refresh missing or outdated information', screenshot: require('../assets/tutorials/home.png'), caption: 'Pull down on Home to refresh your care overview.', steps: ['Pull down on Home, Patients, or Messages to refresh the current view.', 'If an error appears, use Try again. Check your connection if loading continues to fail.', 'If a change has already saved, reload the view before trying the same change again.'] },
];

export default function TutorialsScreen() {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(tutorials[0].title);
  const matches = tutorials.filter(topic => `${topic.title} ${topic.steps.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <Screen><Heading back eyebrow="Provider companion" title="Help & tutorials" detail="Choose a topic for a step-by-step guide, or find a quick refresher." />
    <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 16 }}>Screenshots use sample data. Tap an image to enlarge it.</Text>
    <View style={{ gap: 16 }}><Field label="Search tutorials" placeholder="Try patients, routines, or messages" value={query} onChangeText={setQuery} autoCapitalize="none" />
      {matches.map(topic => <Card key={topic.title}><Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === topic.title }} aria-expanded={expanded === topic.title} onPress={() => setExpanded(expanded === topic.title ? null : topic.title)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text weight="bold" style={{ flex: 1, fontSize: 18 }}>{topic.title}</Text><ChevronDown aria-hidden={true} size={22} color={colors.teal} style={{ transform: [{ rotate: expanded === topic.title ? '180deg' : '0deg' }] }} /></Pressable>
        {expanded === topic.title && <>{topic.steps.map((step, index) => <Text key={step}>{index + 1}. {step}</Text>)}<TutorialScreenshot source={topic.screenshot} caption={topic.caption} /></>}
      </Card>)}
      {!matches.length && <Text accessibilityRole="alert">No tutorials found. Try another word or clear your search.</Text>}
    </View>
  </Screen>;
}
