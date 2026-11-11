import React from 'react';
import { Linking, View } from 'react-native';
import { LockKeyhole, LogOut } from 'lucide-react-native';
import { useSession } from '../src/auth/SessionProvider';
import { Button, Card, Heading, Screen, Text } from '../src/ui/components';
import { useTheme, type Appearance } from '../src/ui/theme';

export default function SettingsScreen() {
  const auth = useSession();
  const { colors, appearance, setAppearance } = useTheme();
  const webUrl = process.env.EXPO_PUBLIC_PROVIDER_WEB_URL;
  return <Screen><Heading back eyebrow="Your workspace" title="App settings" detail="Make the companion comfortable for you." /><View style={{ gap: 18 }}>
    <Card><Text weight="semibold" style={{ fontSize: 18 }}>Appearance</Text><Text style={{ color: colors.muted, fontSize: 13 }}>Choose your workspace appearance.</Text><View style={{ gap: 8 }}>{(['system', 'light', 'dark'] as Appearance[]).map(value => <Button key={value} title={`${value[0].toUpperCase()}${value.slice(1)}${appearance === value ? ' · Selected' : ''}`} secondary={appearance !== value} onPress={() => setAppearance(value)} />)}</View></Card>
    <Card><Text weight="semibold" style={{ fontSize: 18 }}>Workspace security</Text><Text style={{ color: colors.muted, fontSize: 13 }}>Your workspace locks when you leave the app. Manage your password and authenticator on the provider website.</Text>
      {webUrl && /^https:\/\//.test(webUrl) ? <Button secondary title="Open provider website" onPress={() => void Linking.openURL(webUrl)} /> : null}
      <Button secondary title="Lock workspace" icon={<LockKeyhole color={colors.teal} size={18} />} onPress={auth.lock} />
      <Button title="Sign out on this device" icon={<LogOut color={colors.onAccent} size={18} />} busy={auth.busy} onPress={() => void auth.logout()} />
    </Card><Text style={{ textAlign: 'center', color: colors.muted, fontSize: 11 }}>Milestone Provider · Version 1.0.0</Text>
  </View></Screen>;
}
