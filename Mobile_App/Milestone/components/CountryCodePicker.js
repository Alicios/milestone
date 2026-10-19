import { useAppTheme, useThemedStyles } from './AppTheme';
import React, { useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Check from 'lucide-react-native/icons/check';
import Text from './AppText';
import { callingCode, phoneCountries } from '../auth/phoneNumber';
import countryFlags from '../assets/flags';

function CountryFlag({ country, compact = false }) {
  const styles = useThemedStyles(baseStyles);
  return <Image accessible={false} source={countryFlags[country]} resizeMode="contain" style={compact ? styles.compactFlag : styles.flag} />;
}

export default function CountryCodePicker({ country, onChange }) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const countries = useMemo(phoneCountries, []);
  const selected = countries.find(item => item.country === country);
  const query = search.trim().toLowerCase();
  const filtered = countries.filter(item => `${item.name} ${item.country} +${item.code}`.toLowerCase().includes(query));

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Country calling code" accessibilityHint={`${selected?.name}, +${callingCode(country)}. Choose a country.`} accessibilityState={{ expanded: open }} onPress={() => { setSearch(''); setOpen(true); }} style={styles.trigger}>
        <View style={styles.countryRow}><CountryFlag country={country} compact /><Text style={styles.country}>{country}</Text></View>
        <View style={styles.codeRow}><Text style={styles.code}>+{callingCode(country)}</Text><ChevronDown size={12} color={colors.primary} accessible={false} /></View>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.overlay}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={styles.title}>Country calling code</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close country selector" onPress={() => setOpen(false)} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
            </View>
            <TextInput accessibilityLabel="Search countries" value={search} onChangeText={setSearch} placeholder="Search country or calling code" placeholderTextColor={colors.muted} autoCorrect={false} autoCapitalize="none" style={styles.search} />
            <FlatList data={filtered} keyExtractor={item => item.country} keyboardShouldPersistTaps="handled" style={styles.list} ListEmptyComponent={<Text style={styles.empty}>No countries found.</Text>} renderItem={({ item }) => (
              <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} (+${item.code})`} accessibilityState={{ selected: item.country === country }} onPress={() => { onChange(item.country); setOpen(false); }} style={[styles.option, item.country === country && styles.selected]}>
                <CountryFlag country={item.country} />
                <Text style={styles.name}>{item.name} <Text style={styles.iso}>({item.country})</Text></Text>
                <Text style={styles.optionCode}>+{item.code}</Text>
                {item.country === country && <Check size={18} color={colors.primary} accessible={false} />}
              </Pressable>
            )} />
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const baseStyles = StyleSheet.create({
  trigger: { width: 68, minHeight: 54, borderWidth: 1.5, borderColor: '#B7CAC2', borderRadius: 13, backgroundColor: '#FFFDF7', alignItems: 'center', justifyContent: 'center', gap: 2 },
  country: { color: '#357F83', fontSize: 10, fontWeight: '600' },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  compactFlag: { width: 20, height: 20 },
  flag: { width: 30, height: 28 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  code: { color: '#193333', fontSize: 14, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(25,51,51,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 440, height: '80%', backgroundColor: '#FFFDF7', borderRadius: 24, padding: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { flex: 1, color: '#193333', fontSize: 19, fontWeight: '700' },
  close: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  closeText: { color: '#357F83', fontSize: 13, fontWeight: '600' },
  search: { minHeight: 50, borderWidth: 1.5, borderColor: '#B7CAC2', borderRadius: 12, paddingHorizontal: 12, color: '#193333', fontSize: 14, marginBottom: 12 },
  list: { flex: 1 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 10 },
  selected: { backgroundColor: '#EDF2E9' },
  name: { flex: 1, color: '#193333', fontSize: 14 },
  iso: { color: '#357F83', fontSize: 12 },
  optionCode: { color: '#193333', fontSize: 14, fontWeight: '600' },
  empty: { padding: 16, color: '#357F83', fontSize: 14 },
});
