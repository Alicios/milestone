import React from 'react';
import { Linking, View } from 'react-native';
import { LockKeyhole, LogOut } from 'lucide-react-native';
import { useSession } from '../../src/auth/SessionProvider';
import { Avatar, Button, Card, Detail, Heading, Screen, Text } from '../../src/ui/components';
import { useTheme, type Appearance } from '../../src/ui/theme';

export default function AccountScreen() {
  const auth = useSession();
  const { colors, appearance, setAppearance } = useTheme();
  const provider = auth.provider!;
  const webUrl = process.env.EXPO_PUBLIC_PROVIDER_WEB_URL;
  return <Screen><Heading eyebrow="Your workspace" title="Account" detail="A familiar space, wherever care takes you." /><View style={{ gap: 18 }}>
    <Card><View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}><Avatar name={provider.name} url={provider.avatarUrl} size={64} /><View style={{ flex: 1 }}><Text weight="bold" style={{ fontSize: 21, lineHeight: 29 }}>{provider.name}</Text><Text style={{ color: colors.muted }}>{provider.professionalTitle || 'Care provider'}</Text></View></View><Detail label="Email" value={provider.email} /><Detail label="Practice" value={provider.practice} /><Detail label="Phone" value={provider.phone} /></Card>
    <Card><Text weight="semibold" style={{ fontSize: 18 }}>Make yourself at home</Text><Text style={{ color: colors.muted, fontSize: 13 }}>Choose your workspace appearance.</Text><View style={{ gap: 8 }}>{(['system', 'light', 'dark'] as Appearance[]).map(value => <Button key={value} title={`${value[0].toUpperCase()}${value.slice(1)}${appearance === value ? ' · Selected' : ''}`} secondary={appearance !== value} onPress={() => setAppearance(value)} />)}</View></Card>
    <Card><Text weight="semibold" style={{ fontSize: 18 }}>Workspace security</Text><Text style={{ color: colors.muted, fontSize: 13 }}>Your workspace locks when you leave the app. Manage your profile, password, and authenticator on the provider website.</Text>
      {webUrl && /^https:\/\//.test(webUrl) ? <Button secondary title="Open provider website" onPress={() => void Linking.openURL(webUrl)} /> : null}
      <Button secondary title="Lock workspace" icon={<LockKeyhole color={colors.teal} size={18} />} onPress={auth.lock} />
      <Button title="Sign out on this device" icon={<LogOut color={colors.onAccent} size={18} />} busy={auth.busy} onPress={() => void auth.logout()} />
    </Card><Text style={{ textAlign: 'center', color: colors.muted, fontSize: 11 }}>Milestone Provider · Version 1.0.0</Text>
  </View></Screen>;
}
