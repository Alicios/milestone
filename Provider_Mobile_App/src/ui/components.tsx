import React, { type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text as NativeText, TextInput, View, type TextProps, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native';
import { ArrowLeft, ArrowUpRight, ChevronRight, ShieldCheck } from 'lucide-react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from './theme';
import { initials, type RoutineStatus } from '../lib/domain';

export function Text({ style, weight = 'regular', ...props }: TextProps & { weight?: 'regular' | 'medium' | 'semibold' | 'bold' }) {
  const { colors } = useTheme();
  const fonts = { regular: 'Montserrat_400Regular', medium: 'Montserrat_500Medium', semibold: 'Montserrat_600SemiBold', bold: 'Montserrat_700Bold' };
  return <NativeText {...props} style={[{ fontFamily: fonts[weight], fontSize: 15, lineHeight: 23, color: colors.ink }, style]} />;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  const { colors, mode } = useTheme();
  const brand = mode === 'dark' ? '#9BCBC5' : '#125B75';
  return <View accessible accessibilityLabel="Milestone Provider" style={styles.row}><Svg width={42} height={42} viewBox="0 0 48 48">
    <Path fill={brand} d="M24 4C12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20S35.046 4 24 4Zm0 4c8.837 0 16 7.163 16 16 0 2.105-.406 4.115-1.144 5.953l-5.3-2.367A10.005 10.005 0 0 0 34 24c0-5.523-4.477-10-10-10s-10 4.477-10 10c0 1.25.23 2.446.65 3.55l-5.282 2.361A15.938 15.938 0 0 1 8 24C8 15.163 15.163 8 24 8Z" />
    <Path fill={brand} d="M16.164 29.82A9.98 9.98 0 0 0 24 34a9.98 9.98 0 0 0 7.836-4.18l-3.278-1.465A6.003 6.003 0 0 1 24 30a6.003 6.003 0 0 1-4.558-1.645l-3.278 1.465Z" />
    <Path fill="#d9822b" d="M22 18h4v4h4v4h-4v4h-4v-4h-4v-4h4v-4Z" />
  </Svg><View style={{ flexShrink: 1 }}><Text weight="bold" style={{ fontSize: compact ? 20 : 27, lineHeight: 34, color: brand }}>Milestone</Text><Text weight="semibold" style={{ fontSize: 10, letterSpacing: 2, color: colors.teal }}>PROVIDER COMPANION</Text></View></View>;
}
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}
export function Button({ title, onPress, secondary = false, disabled = false, busy = false, icon, testID }: { title: string; onPress(): void; secondary?: boolean; disabled?: boolean; busy?: boolean; icon?: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} testID={testID} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: secondary ? colors.soft : colors.accent, opacity: disabled || busy ? 0.55 : pressed ? 0.8 : 1 }]}>
    {busy ? <ActivityIndicator color={secondary ? colors.ink : colors.onAccent} /> : icon}<Text weight="semibold" style={{ color: secondary ? colors.ink : colors.onAccent, textAlign: 'center', flexShrink: 1 }}>{title}</Text>
  </Pressable>;
}
export function Field({ label, hideLabel = false, ...props }: TextInputProps & { label: string; hideLabel?: boolean }) {
  const { colors } = useTheme();
  return <View style={{ gap: 7 }}>{!hideLabel && <Text weight="semibold" style={{ fontSize: 13 }}>{label}</Text>}<TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.border }, props.style]} /></View>;
}
export function Notice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  return <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: colors.soft, borderColor: colors.border }]}><Text style={{ color: colors.error }}>{message}</Text>{onRetry && <Button secondary title="Try again" onPress={onRetry} />}</View>;
}
export function Empty({ title, detail }: { title: string; detail: string }) {
  const { colors } = useTheme();
  return <Card style={{ alignItems: 'center', paddingVertical: 34 }}><View style={[styles.emptyMark, { backgroundColor: colors.soft }]}><ShieldCheck color={colors.teal} size={25} /></View><Text weight="semibold" style={{ fontSize: 18, textAlign: 'center' }}>{title}</Text><Text style={{ textAlign: 'center', color: colors.muted, maxWidth: 340 }}>{detail}</Text></Card>;
}
export function Heading({ eyebrow, title, detail, action, back = false }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode; back?: boolean }) {
  const { colors } = useTheme();
  return <View style={{ gap: 10, marginBottom: 24 }}>{back && <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={[styles.row, { minHeight: 44, alignSelf: 'flex-start' }]}><ArrowLeft color={colors.teal} size={19} /><Text weight="semibold" style={{ color: colors.teal }}>Back</Text></Pressable>}
    {eyebrow && <Text weight="semibold" style={{ color: colors.teal, fontSize: 11, letterSpacing: 2 }}>{eyebrow.toUpperCase()}</Text>}
    <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}><Text accessibilityRole="header" weight="bold" style={{ fontSize: 30, lineHeight: 39, flexShrink: 1 }}>{title}</Text>{action}</View>
    {detail && <Text style={{ color: colors.muted }}>{detail}</Text>}
  </View>;
}
export function Avatar({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = React.useState(false);
  return url && !failed ? <Image accessibilityLabel={`${name} profile photo`} source={{ uri: url }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}><Text weight="bold" style={{ fontSize: size * 0.32, color: colors.teal }}>{initials(name).toUpperCase()}</Text></View>;
}
const statusColors: Record<RoutineStatus, [string, string]> = { neutral: ['#ECEFF1', '#263238'], completed: ['#D4EDDD', '#174C30'], inProgress: ['#D8EAFF', '#163E70'], issue: ['#FFF1B8', '#594400'], missed: ['#FBE0E0', '#792D32'], critical: ['#B42332', '#FFFFFF'] };
const darkStatusColors: Record<RoutineStatus, [string, string]> = { neutral: ['#34454E', '#F0F3F5'], completed: ['#204B36', '#DCF8E7'], inProgress: ['#203F62', '#E0EFFF'], issue: ['#584B1E', '#FFF2B8'], missed: ['#EFB9BD', '#592028'], critical: ['#AC2236', '#FFFFFF'] };
export function StatusPill({ status, label }: { status: RoutineStatus; label: string }) {
  const { mode } = useTheme();
  const [bg, fg] = (mode === 'dark' ? darkStatusColors : statusColors)[status];
  return <View style={{ alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: bg }}><Text weight="semibold" style={{ color: fg, fontSize: 11, lineHeight: 17 }}>{label}</Text></View>;
}
export function Detail({ label, value }: { label: string; value?: string | null }) {
  const { colors } = useTheme();
  return <View style={{ gap: 4 }}><Text style={{ fontSize: 11, color: colors.muted, letterSpacing: 0.6 }}>{label.toUpperCase()}</Text><Text weight="medium" selectable>{value || 'Not provided'}</Text></View>;
}
export function Screen({ children, refreshControl }: { children: ReactNode; refreshControl?: React.ReactElement }) {
  const { colors } = useTheme();
  return <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} keyboardShouldPersistTaps="handled" refreshControl={refreshControl} contentContainerStyle={{ flexGrow: 1 }}><View style={styles.container}>{children}</View></ScrollView>;
}
export const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 1050, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 28, paddingBottom: 36 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 14 },
  button: { borderRadius: 12, minHeight: 48, paddingVertical: 12, paddingHorizontal: 18, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 50, paddingHorizontal: 15, paddingVertical: 12, borderWidth: 1, borderRadius: 12, fontFamily: 'Montserrat_400Regular', fontSize: 15 },
  notice: { padding: 16, borderWidth: 1, borderRadius: 14, gap: 12, marginBottom: 14 },
  emptyMark: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
export { ArrowUpRight, ChevronRight };
