import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import HexAvatar from './HexAvatar';

const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// A player's one-line stat summary from their MVP breakdown.
function statLine(p) {
  const bits = [];
  if (p.batLine) bits.push(p.batLine);
  if (p.bowlLine) bits.push(p.bowlLine);
  if (p.fieldCount) bits.push(`${p.fieldCount} ${p.fieldCount === 1 ? 'catch/RO' : 'catches/ROs'}`);
  return bits.join('  ·  ');
}

/**
 * Post-match awards popup shown to the scorer. Celebrates the winners with a
 * hero "Man of the Match" card plus Fighter / Best Batter / Bowler / Fielder,
 * all derived from MVP points. onClose fires on the CONTINUE button.
 */
export default function MatchAwardsModal({ visible, loading, awards, result, onClose }) {
  const DS = useTheme().colors;
  const s = useThemedStyles(makeStyles);

  const motm = awards?.manOfMatch;
  const fighter = awards?.fighter;
  const minor = [
    { key: 'bat', label: 'Best Batter', icon: 'cricket', color: DS.blue, p: awards?.bestBatter },
    { key: 'bowl', label: 'Best Bowler', icon: 'bowling', color: DS.success, p: awards?.bestBowler },
    { key: 'field', label: 'Best Fielder', icon: 'hand-back-right', color: DS.lime, p: awards?.bestFielder },
  ].filter((x) => x.p);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          {/* Trophy header */}
          <View style={s.header}>
            <View style={s.trophyRing}>
              <Icon name="trophy-variant" size={34} color={DS.onLime} />
            </View>
            <Text style={s.title}>MATCH COMPLETE</Text>
            {!!result && <Text style={s.result} numberOfLines={2}>{result}</Text>}
          </View>

          {loading ? (
            <View style={s.loading}><ActivityIndicator color={DS.lime} /><Text style={s.loadingTxt}>Calculating awards…</Text></View>
          ) : (
            <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
              {/* Man of the Match — hero */}
              {motm && (
                <View style={s.heroCard}>
                  <View style={s.heroBadge}><Icon name="star-four-points" size={12} color={DS.onLime} /><Text style={s.heroBadgeTxt}>MAN OF THE MATCH</Text></View>
                  <View style={s.heroRow}>
                    <HexAvatar round size={56} color={DS.lime}><Text style={s.heroInitials}>{initials(motm.name)}</Text></HexAvatar>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={s.heroName} numberOfLines={1}>{motm.name}</Text>
                      <Text style={s.heroTeam} numberOfLines={1}>{motm.teamName}</Text>
                      {!!statLine(motm) && <Text style={s.heroStat} numberOfLines={1}>{statLine(motm)}</Text>}
                    </View>
                    <View style={s.mvpPill}><Text style={s.mvpVal}>{motm.total}</Text><Text style={s.mvpLbl}>MVP</Text></View>
                  </View>
                </View>
              )}

              {/* Fighter of the Match */}
              {fighter && (
                <View style={[s.awardRow, { borderColor: DS.warn + '55' }]}>
                  <View style={[s.awardIcon, { backgroundColor: DS.warn + '22' }]}><Icon name="arm-flex" size={18} color={DS.warn} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.awardLabel}>FIGHTER OF THE MATCH</Text>
                    <Text style={s.awardName} numberOfLines={1}>{fighter.name} <Text style={s.awardTeam}>· {fighter.teamName}</Text></Text>
                    {!!statLine(fighter) && <Text style={s.awardStat} numberOfLines={1}>{statLine(fighter)}</Text>}
                  </View>
                  <Text style={s.awardMvp}>{fighter.total}</Text>
                </View>
              )}

              {/* Best Batter / Bowler / Fielder */}
              {minor.map(({ key, label, icon, color, p }) => (
                <View key={key} style={s.awardRow}>
                  <View style={[s.awardIcon, { backgroundColor: color + '22' }]}><Icon name={icon} size={18} color={color} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.awardLabel}>{label.toUpperCase()}</Text>
                    <Text style={s.awardName} numberOfLines={1}>{p.name} <Text style={s.awardTeam}>· {p.teamName}</Text></Text>
                    {!!statLine(p) && <Text style={s.awardStat} numberOfLines={1}>{statLine(p)}</Text>}
                  </View>
                  <Text style={s.awardMvp}>{p.total}</Text>
                </View>
              ))}

              {!motm && !fighter && minor.length === 0 && (
                <Text style={s.empty}>No award data for this match.</Text>
              )}
            </ScrollView>
          )}

          <TouchableOpacity style={s.cta} onPress={onClose} activeOpacity={0.9}>
            <Text style={s.ctaTxt}>CONTINUE</Text>
            <Icon name="arrow-right" size={18} color={DS.white} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: DS.surface, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: DS.faint },
  header: { alignItems: 'center', marginBottom: 16 },
  trophyRing: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: DS.lime,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    shadowColor: DS.lime, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  title: { fontSize: 13, fontWeight: '900', letterSpacing: 2, color: DS.textVariant },
  result: { fontSize: 17, fontWeight: '900', color: DS.textPrimary, textAlign: 'center', marginTop: 6 },
  loading: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  loadingTxt: { color: DS.textMuted, fontSize: 13 },

  heroCard: {
    backgroundColor: DS.lime + '14', borderRadius: 18, padding: 14, marginBottom: 12,
    borderWidth: 1.5, borderColor: DS.lime + '55',
  },
  heroBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, backgroundColor: DS.lime, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10 },
  heroBadgeTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5, color: DS.onLime },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroInitials: { fontSize: 18, fontWeight: '900', color: DS.onLime },
  heroName: { fontSize: 18, fontWeight: '900', color: DS.textPrimary },
  heroTeam: { fontSize: 12, fontWeight: '700', color: DS.textMuted, marginTop: 1 },
  heroStat: { fontSize: 12, fontWeight: '700', color: DS.textVariant, marginTop: 4, fontVariant: ['tabular-nums'] },
  mvpPill: { alignItems: 'center', backgroundColor: DS.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: DS.faint },
  mvpVal: { fontSize: 18, fontWeight: '900', color: DS.lime, fontVariant: ['tabular-nums'] },
  mvpLbl: { fontSize: 9, fontWeight: '800', color: DS.textMuted, letterSpacing: 1 },

  awardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: DS.surfaceLow, borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: DS.faint },
  awardIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  awardLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5, color: DS.textMuted },
  awardName: { fontSize: 15, fontWeight: '800', color: DS.textPrimary, marginTop: 2 },
  awardTeam: { fontSize: 12, fontWeight: '600', color: DS.textMuted },
  awardStat: { fontSize: 12, fontWeight: '700', color: DS.textVariant, marginTop: 2, fontVariant: ['tabular-nums'] },
  awardMvp: { fontSize: 16, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  empty: { textAlign: 'center', color: DS.textMuted, paddingVertical: 24 },

  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: DS.blueDeep, borderRadius: 14, paddingVertical: 15, marginTop: 8 },
  ctaTxt: { fontSize: 15, fontWeight: '900', color: DS.white, letterSpacing: 1 },
});
