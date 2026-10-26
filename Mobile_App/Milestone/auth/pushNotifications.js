import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPatientPushNotifications(expectedUserId) {
  if (!expectedUserId || Platform.OS === 'web' || !isSupabaseConfigured || !supabase) return null;

  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) return null;

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user || user.id !== expectedUserId) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('routine-updates', {
      name: 'Routine updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let status = existingStatus;
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return null;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await supabase.from('patient_push_tokens').upsert({
    expo_push_token: token,
    auth_user_id: user.id,
    platform: Platform.OS,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'expo_push_token' });
  if (error) throw error;
  return token;
}
