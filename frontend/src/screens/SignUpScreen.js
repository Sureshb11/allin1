import { useTheme, useThemedStyles } from "../theme/ThemeContext";import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, StatusBar } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { BRAND_TAGLINE } from '../components/BrandLogo';







const SPORTS = [
{ key: 'football', label: 'Football', icon: 'soccer' },
{ key: 'basketball', label: 'Basketball', icon: 'basketball' },
{ key: 'tennis', label: 'Tennis', icon: 'tennis' },
{ key: 'volleyball', label: 'Volleyball', icon: 'volleyball' },
{ key: 'badminton', label: 'Badminton', icon: 'badminton' },
{ key: 'tabletennis', label: 'Table Tennis', icon: 'table-tennis' },
{ key: 'hockey', label: 'Hockey', icon: 'hockey-sticks' },
{ key: 'kabaddi', label: 'Kabaddi', icon: 'account-group' },
{ key: 'cricket', label: 'Cricket', icon: 'cricket' },
{ key: 'khokho', label: 'Kho-Kho', icon: 'run-fast' },
{ key: 'boxing', label: 'Boxing', icon: 'boxing-glove' },
{ key: 'karate', label: 'Karate', icon: 'karate' },
{ key: 'judo', label: 'Judo', icon: 'weight-lifter' },
{ key: 'wrestling', label: 'Wrestling', icon: 'kabaddi' },
{ key: 'handball', label: 'Handball', icon: 'handball' },
{ key: 'squash', label: 'Squash', icon: 'tennis-ball' },
{ key: 'pickleball', label: 'Pickleball', icon: 'tennis' }];


// Split flat list into alternating rows of 3 and 4
function buildRows(items) {
  const rows = [];
  let i = 0;
  let even = false;
  while (i < items.length) {
    const count = even ? 4 : 3;
    rows.push({ items: items.slice(i, i + count), offset: even });
    i += count;
    even = !even;
  }
  return rows;
}

const CHIP = 82;

export default function SignUpScreen({ navigation }) {const DS = useTheme().colors;const s = useThemedStyles(makeS);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState(new Set(['cricket']));

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const canJoin = name.trim().length > 0 && selected.size >= 3;

  const rows = buildRows(SPORTS);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

      {/* ── HEADER ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>
        {/* Logo */}
        <View style={s.logo}>
          <View style={s.logoStar}>
            <Icon name="star" size={16} color={DS.bg} />
          </View>
          <Text style={s.logoLocal}>LOCAL</Text>
          <View style={s.logoBadge}>
            <Text style={s.logoLegends}>LEGENDS</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        
        {/* ── TITLE ── */}
        <View style={s.titleBlock}>
          <Text style={s.titleLine1}>JOIN THE</Text>
          <Text style={s.titleLine2}>TEAM</Text>
          <View style={s.titleBar} />
          <Text style={s.tagline}>{BRAND_TAGLINE}</Text>
        </View>

        {/* ── NAME INPUT ── */}
        <View style={s.inputWrap}>
          <Text style={s.inputLabel}>FULL NAME</Text>
          <TextInput
            style={s.input}
            placeholder="ENTER YOUR NAME"
            placeholderTextColor={DS.surfaceHighest}
            value={name}
            onChangeText={setName}
            autoCapitalize="characters" />
          
          <View style={s.inputUnderline} />
        </View>

        {/* ── SPORT SELECTION ── */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionLabel}>SELECT YOUR INTERESTS</Text>
          <Text style={s.sectionHint}>CHOOSE 3 OR MORE</Text>
        </View>

        {/* Honeycomb rows */}
        <View style={s.honeycomb}>
          {rows.map((row, ri) =>
          <View
            key={ri}
            style={[
            s.honeyRow,
            ri > 0 && s.honeyRowOffset,
            row.offset && s.honeyRowEven]
            }>
            
              {row.items.map((sport) => {
              const active = selected.has(sport.key);
              return (
                <TouchableOpacity
                  key={sport.key}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => toggle(sport.key)}
                  activeOpacity={0.75}>
                  
                    <Icon
                    name={sport.icon}
                    size={26}
                    color={active ? DS.limeDark : DS.lime} />
                  
                    <Text style={[s.chipLabel, active && s.chipLabelActive]}>
                      {sport.label}
                    </Text>
                  </TouchableOpacity>);

            })}
            </View>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── FOOTER CTA ── */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[s.joinBtn, !canJoin && s.joinBtnDisabled]}
          onPress={() => {
            if (!canJoin) return;
            navigation.navigate('MobileVerification', { name, sports: [...selected], newUser: true });
          }}
          disabled={!canJoin}>
          
          <Text style={[s.joinBtnText, !canJoin && s.joinBtnTextDim]}>
            JOIN THE TEAM
          </Text>
        </TouchableOpacity>
        {!canJoin &&
        <Text style={s.hintText}>
            {name.trim() ? `Select ${Math.max(0, 3 - selected.size)} more sport${3 - selected.size !== 1 ? 's' : ''}` : 'Enter your name to get started'}
          </Text>
        }
      </View>
    </View>);

}

const makeS = (DS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16,
    backgroundColor: DS.bg
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: DS.surfaceHigh,
    alignItems: 'center', justifyContent: 'center'
  },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoStar: { backgroundColor: DS.lime, borderRadius: 6, padding: 6, alignItems: 'center', justifyContent: 'center' },
  logoLocal: { fontSize: 18, fontWeight: '900', color: DS.textPrimary, letterSpacing: -0.5, fontStyle: 'italic' },
  logoBadge: { backgroundColor: DS.lime, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  logoLegends: { fontSize: 18, fontWeight: '900', color: DS.bg, letterSpacing: -0.5, fontStyle: 'italic' },

  body: { paddingHorizontal: 20, paddingTop: 24 },

  // Title
  titleBlock: { marginBottom: 32 },
  titleLine1: { fontSize: 52, fontWeight: '900', color: DS.textPrimary, letterSpacing: -2, lineHeight: 56 },
  titleLine2: { fontSize: 52, fontWeight: '900', color: DS.lime, letterSpacing: -2, lineHeight: 56, fontStyle: 'italic' },
  titleBar: { width: 80, height: 4, backgroundColor: DS.lime, borderRadius: 2, marginTop: 8 },
  tagline: {
    fontSize: 11, fontWeight: '700', color: DS.textMuted,
    letterSpacing: 2.4, textTransform: 'uppercase', marginTop: 14,
  },

  // Input
  inputWrap: { marginBottom: 28 },
  inputLabel: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 1.8, marginBottom: 8 },
  input: {
    fontSize: 20, fontWeight: '800', color: DS.textPrimary,
    backgroundColor: 'transparent', paddingVertical: 8, paddingHorizontal: 0,
    letterSpacing: 1
  },
  inputUnderline: { height: 2, backgroundColor: DS.surfaceHighest },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 1.5 },
  sectionHint: { fontSize: 10, fontWeight: '700', color: DS.lime, letterSpacing: 1 },

  // Honeycomb
  honeycomb: { alignItems: 'center' },
  honeyRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  honeyRowOffset: { marginTop: -16 },
  honeyRowEven: {},

  chip: {
    width: CHIP, height: CHIP, borderRadius: CHIP / 2,
    backgroundColor: DS.surfaceHigh,
    borderWidth: 1, borderColor: DS.surfaceHighest,
    alignItems: 'center', justifyContent: 'center',
    gap: 4, padding: 8
  },
  chipActive: {
    backgroundColor: DS.lime,
    borderColor: DS.lime,
    shadowColor: DS.lime,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8
  },
  chipLabel: {
    fontSize: 7.5, fontWeight: '800', color: DS.textMuted,
    textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 10
  },
  chipLabelActive: { color: DS.limeDark },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: DS.bg, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
    alignItems: 'center', gap: 8
  },
  joinBtn: {
    width: '100%', backgroundColor: DS.lime, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center'
  },
  joinBtnDisabled: { backgroundColor: DS.surfaceHigh },
  joinBtnText: { fontSize: 16, fontWeight: '900', color: DS.limeDark, letterSpacing: 1.5 },
  joinBtnTextDim: { color: DS.textMuted },
  hintText: { fontSize: 12, color: DS.textMuted, textAlign: 'center' }
});