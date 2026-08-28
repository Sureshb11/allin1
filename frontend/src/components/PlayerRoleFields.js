import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import {
  PRIMARY_ROLES, BATTING_STYLES, BOWLING_STYLES, defaultBowlingStyle,
} from '../sports/cricketProfile';

// The three questions that describe a cricketer: what they are, which hand they
// bat with, and how they bowl. Shared by the onboarding step and Edit Player
// Profile so both ask the same thing in the same words.
//
// Why cards rather than a dropdown for the role: it is the field that decides
// how someone is described everywhere else in the app, it has exactly four
// answers, and a card can say what the answer MEANS. A dropdown makes the most
// important question look like the least important one.
//
// Bowling style is a sheet, not cards — thirteen options don't fit on a phone
// as cards, and it is the optional field. Picking a batter or a keeper starts
// it at "None", which is right far more often than not and always changeable.
export default function PlayerRoleFields({ value, onChange, errors = {} }) {
  const DS = useTheme().colors;
  const s = useThemedStyles(makeStyles);
  const [bowlingOpen, setBowlingOpen] = useState(false);

  const set = (patch) => onChange({ ...value, ...patch });

  const pickRole = (role) => {
    // Changing the role only SUGGESTS a bowling style; it never overwrites one
    // already chosen. An all-rounder who becomes a keeper still bowls leg spin.
    const suggested = defaultBowlingStyle(role);
    set({
      primaryRole: role,
      bowlingStyle: value.bowlingStyle || suggested || null,
    });
  };

  return (
    <View>
      {/* ── Primary role ── */}
      <View style={s.head}>
        <Text style={s.label}>Primary role</Text>
        <Text style={s.req}>Required</Text>
      </View>
      <View style={s.cardGrid}>
        {PRIMARY_ROLES.map((r) => {
          const on = value.primaryRole === r.value;
          return (
            <TouchableOpacity key={r.value} style={[s.card, on && s.cardOn]}
              onPress={() => pickRole(r.value)} activeOpacity={0.85}>
              <View style={[s.cardIcon, on && { backgroundColor: DS.lime }]}>
                <Icon name={r.icon} size={16} color={on ? DS.onLime : DS.textVariant} />
              </View>
              <Text style={[s.cardTitle, on && { color: DS.lime }]}>{r.value}</Text>
              <Text style={s.cardBlurb} numberOfLines={1}>{r.blurb}</Text>
              {on && <Icon name="check-circle" size={14} color={DS.lime} style={s.cardTick} />}
            </TouchableOpacity>
          );
        })}
      </View>
      {!!errors.primaryRole && <Text style={s.err}>{errors.primaryRole}</Text>}

      {/* ── Batting hand ── */}
      <View style={[s.head, { marginTop: 18 }]}>
        <Text style={s.label}>Batting style</Text>
        <Text style={s.req}>Required</Text>
      </View>
      <View style={s.segment}>
        {BATTING_STYLES.map((b) => {
          const on = value.battingStyle === b;
          return (
            <TouchableOpacity key={b} style={[s.segBtn, on && s.segBtnOn]}
              onPress={() => set({ battingStyle: b })} activeOpacity={0.85}>
              <Text style={[s.segText, on && s.segTextOn]}>{b.replace(' Bat', '')}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!errors.battingStyle && <Text style={s.err}>{errors.battingStyle}</Text>}

      {/* ── Bowling style ── */}
      <View style={[s.head, { marginTop: 18 }]}>
        <Text style={s.label}>Bowling style</Text>
        <Text style={s.opt}>Optional</Text>
      </View>
      <TouchableOpacity style={s.select} onPress={() => setBowlingOpen(true)} activeOpacity={0.8}>
        <Icon name="bowling" size={16} color={DS.textMuted} />
        <Text style={[s.selectText, !value.bowlingStyle && { color: DS.textMuted }]}>
          {value.bowlingStyle || 'Add a bowling style'}
        </Text>
        <Icon name="chevron-down" size={18} color={DS.textMuted} />
      </TouchableOpacity>

      <Modal visible={bowlingOpen} transparent animationType="slide" onRequestClose={() => setBowlingOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setBowlingOpen(false)} />
        <View style={s.sheet}>
          <View style={s.grab} />
          <Text style={s.sheetTitle}>Bowling style</Text>
          <ScrollView style={{ maxHeight: 400 }}>
            {BOWLING_STYLES.map((g) => (
              <View key={g.group}>
                <Text style={s.groupLabel}>{g.group.toUpperCase()}</Text>
                {g.options.map((o) => {
                  const on = value.bowlingStyle === o;
                  return (
                    <TouchableOpacity key={o} style={s.optionRow}
                      onPress={() => { set({ bowlingStyle: o }); setBowlingOpen(false); }}>
                      <Text style={[s.optionText, on && { color: DS.lime, fontWeight: '800' }]}>{o}</Text>
                      {on && <Icon name="check" size={17} color={DS.lime} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  label: { fontSize: 12, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.4 },
  req: { fontSize: 10, fontWeight: '800', color: DS.lime, letterSpacing: 0.4 },
  opt: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.4 },

  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: {
    width: '48%', borderRadius: 12, padding: 10,
    backgroundColor: DS.surfaceHigh, borderWidth: 1.5, borderColor: DS.border,
  },
  cardOn: { borderColor: DS.lime, backgroundColor: DS.lime + '12' },
  cardIcon: {
    width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: DS.surfaceHighest, marginBottom: 6,
  },
  cardTitle: { fontSize: 13, fontWeight: '900', color: DS.textPrimary },
  cardBlurb: { fontSize: 10, fontWeight: '600', color: DS.textMuted, marginTop: 2, lineHeight: 12 },
  cardTick: { position: 'absolute', top: 8, right: 8 },

  segment: { flexDirection: 'row', gap: 8 },
  segBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    backgroundColor: DS.surfaceHigh, borderWidth: 1.5, borderColor: DS.border,
  },
  segBtnOn: { borderColor: DS.lime, backgroundColor: DS.lime + '12' },
  segText: { fontSize: 13.5, fontWeight: '800', color: DS.textVariant },
  segTextOn: { color: DS.lime },

  select: {
    flexDirection: 'row', alignItems: 'center', gap: 9, height: 50, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: DS.surfaceHigh, borderWidth: 1.5, borderColor: DS.border,
  },
  selectText: { flex: 1, fontSize: 14, fontWeight: '700', color: DS.textPrimary },

  err: { fontSize: 11, fontWeight: '700', color: DS.coral, marginTop: 6 },

  backdrop: { flex: 1, backgroundColor: '#0009' },
  sheet: {
    backgroundColor: DS.surfaceLow, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28,
  },
  grab: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: DS.faint, marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: DS.textPrimary, marginBottom: 6 },
  groupLabel: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.8, marginTop: 14, marginBottom: 2 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: DS.faint,
  },
  optionText: { fontSize: 14.5, fontWeight: '600', color: DS.textPrimary },
});
