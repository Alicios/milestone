import React from 'react';
import { Linking, View } from 'react-native';
import { useSession } from '../src/auth/SessionProvider';
import { Avatar, Button, Card, Detail, Heading, Screen, Text } from '../src/ui/components';
import { useTheme } from '../src/ui/theme';

export default function ProfileScreen() {
  const { provider } = useSession();
  const { colors } = useTheme();
  const webUrl = process.env.EXPO_PUBLIC_PROVIDER_WEB_URL;
  return <Screen><Heading back eyebrow="Your workspace" title="Profile" detail="Your provider details, shared with the web app." />
    <Card><View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}><Avatar key={provider!.avatarUrl ?? provider!.id} name={provider!.name} url={provider!.avatarUrl} size={64} /><View style={{ flex: 1 }}><Text weight="bold" style={{ fontSize: 21, lineHeight: 29 }}>{provider!.name}</Text><Text style={{ color: colors.muted }}>{provider!.professionalTitle || 'Care provider'}</Text></View></View><Detail label="Email" value={provider!.email} /><Detail label="Practice" value={provider!.practice} /><Detail label="Phone" value={provider!.phone} />
      <Text style={{ color: colors.muted, fontSize: 13 }}>Manage your provider details and profile photo on the provider website.</Text>
      {webUrl && /^https:\/\//.test(webUrl) ? <Button secondary title="Open provider website" onPress={() => void Linking.openURL(webUrl)} /> : null}
    </Card>
  </Screen>;
}
