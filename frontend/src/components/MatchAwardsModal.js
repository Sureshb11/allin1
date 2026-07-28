import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import HexAvatar from './HexAvatar';

const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

const num = (n) => (n === undefined || n === null ? 0 : n);

// A player's one-line stat summary from their MVP breakdown.
function statLine(p) {
  const bits = [];
  if (p.batLine) bits.push(p.batLine);
  if (p.bowlLine) bits.push(p.bowlLine);
  if (p.fieldCount) bits.push(`${p.fieldCount} ${p.fieldCount === 1 ? 'catch/RO' : 'catches/ROs'}`);
  return bits.join('  ·  ');
}

/**
 * The same split as one compact line, for list rows where four numeric columns
 * would squeeze a name down to nothing on a phone.
 */
function SplitLine({ p, s, DS }) {
  return (
    <Text style={s.splitLine} numberOfLines={1}>
      <Text style={[s.splitLineLbl, { color: DS.blue }]}>BAT </Text>{num(p.bat)}
      <Text style={s.splitLineSep}>{'   '}</Text>
      <Text style={[s.splitLineLbl, { color: DS.success || DS.lime }]}>BOWL </Text>{num(p.bowl)}
      <Text style={s.splitLineSep}>{'   '}</Text>
      <Text style={[s.splitLineLbl, { color: DS.lime }]}>FLD </Text>{num(p.field)}
    </Text>
  );
}

/**
 * Where an MVP total came from: batting + bowling + fielding. Always all three,
 * even at zero — the columns then line up down a list, and a total is never a
 * bare number nobody can account for. The server rounds the parts and sums THOSE
 * into the total, so what's on screen always adds up.
 */
function PointsSplit({ p, s, DS }) {
  const parts = [
    ['BAT', num(p.bat), DS.blue],
    ['BOWL', num(p.bowl), DS.success || DS.lime],
    ['FIELD', num(p.field), DS.lime],
  ];
  return (
    <View style={s.splitRow}>
      {parts.map(([label, val, color], i) => (
        <React.Fragment key={label}>
          {i > 0 && <Text style={s.splitOp}>+</Text>}
          <View style={s.splitChip}>
            <Text style={[s.splitLbl, { color }]}>{label}</Text>
            <Text style={s.splitVal}>{val}</Text>
          </View>
        </React.Fragment>
      ))}
      <Text style={s.splitOp}>=</Text>
      <Text style={s.splitTotal}>{num(p.total)}</Text>
    </View>
  );
}

/**
 * Post-match awards popup shown to the scorer. Celebrates the winners with a
 * hero "Man of the Match" card plus Fighter / Best Batter / Bowler / Fielder,
 * all derived from MVP points. onClose fires on the CONTINUE button.
 */
export default function MatchAwardsModal({ visible, loading, awards, result, onClose }) {
  const DS = useTheme().colors;
  const s = useThemedStyles(makeStyles);
  // The whole squad's points, folded away behind the awards — the celebration
  // reads first, the accounting is one tap under it.
  const [showAll, setShowAll] = useState(false);

  const motm = awards?.manOfMatch;
  const fighter = awards?.fighter;
  const ranked = awards?.mvp || [];
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
                  <PointsSplit p={motm} s={s} DS={DS} />
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
                    <PointsSplit p={fighter} s={s} DS={DS} />
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
                    <PointsSplit p={p} s={s} DS={DS} />
                  </View>
                  <Text style={s.awardMvp}>{p.total}</Text>
                </View>
              ))}

              {/* Every player's points, in the same three columns the awards are
                  built from — so an award is checkable against the field, not just
                  announced. Folded away by default; the awards are the headline. */}
              {ranked.length > 0 && (
                <View style={s.tableCard}>
                  <TouchableOpacity style={s.tableHead} onPress={() => setShowAll((v) => !v)} activeOpacity={0.7}>
                    <Text style={s.tableTitle}>MVP POINTS</Text>
                    <Text style={s.tableToggle}>{showAll ? 'Hide' : `All ${ranked.length}`}</Text>
                    <Icon name={showAll ? 'chevron-up' : 'chevron-down'} size={16} color={DS.textMuted} />
                  </TouchableOpacity>
                  {(showAll ? ranked : ranked.slice(0, 5)).map((p, i) => (
                    <View key={i} style={s.tableRow}>
                      <Text style={s.rowRank}>{i + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowName} numberOfLines={1}>
                          {p.name} <Text style={s.rowTeam}>· {p.teamName}</Text>
                        </Text>
                        <SplitLine p={p} s={s} DS={DS} />
                      </View>
                      <Text style={s.cellTotal}>{num(p.total)}</Text>
                    </View>
                  ))}
                </View>
              )}

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

  // bat + bowl + field = total, spelled out under a player
  splitRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  splitChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.surface, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 1, borderColor: DS.faint,
  },
  splitLbl: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  splitVal: { fontSize: 11, fontWeight: '800', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  splitOp: { fontSize: 11, fontWeight: '800', color: DS.textMuted, marginHorizontal: 1 },
  splitTotal: { fontSize: 12, fontWeight: '900', color: DS.lime, fontVariant: ['tabular-nums'] },

  // Every player's points, three columns and a total
  tableCard: { backgroundColor: DS.surfaceLow, borderRadius: 14, borderWidth: 1, borderColor: DS.faint, marginBottom: 10, overflow: 'hidden' },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  tableTitle: { flex: 1, fontSize: 11, fontWeight: '900', letterSpacing: 1, color: DS.textVariant },
  tableToggle: { fontSize: 11, fontWeight: '800', color: DS.textMuted },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: DS.faint },
  rowRank: { width: 16, fontSize: 11, fontWeight: '800', color: DS.textMuted, textAlign: 'center' },
  rowName: { fontSize: 13, fontWeight: '800', color: DS.textPrimary },
  rowTeam: { fontSize: 10, fontWeight: '600', color: DS.textMuted },
  splitLine: { fontSize: 11, fontWeight: '800', color: DS.textVariant, marginTop: 2, fontVariant: ['tabular-nums'] },
  splitLineLbl: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  splitLineSep: { color: DS.faint },
  cellTotal: { minWidth: 38, fontSize: 15, fontWeight: '900', color: DS.lime, textAlign: 'right', fontVariant: ['tabular-nums'] },

  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: DS.blueDeep, borderRadius: 14, paddingVertical: 15, marginTop: 8 },
  ctaTxt: { fontSize: 15, fontWeight: '900', color: DS.white, letterSpacing: 1 },
});
