import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';














// Cricket dismissal notation: "b Bowler", "c Fielder b Bowler", "c & b Bowler",
// "lbw b Bowler", "st Keeper b Bowler", "run out (Fielder)", "hit wicket b Bowler".
function formatDismissal(wicketType, catcher, bowler) {
  const t = String(wicketType || '').toLowerCase().replace(/[\s&]/g, '');
  const b = bowler || '';
  switch (t) {
    case 'bowled': return `b ${b}`;
    case 'lbw': return `lbw b ${b}`;
    case 'caught':
      if (catcher && bowler && catcher === bowler) return `c & b ${b}`;
      return `c ${catcher || 'fielder'} b ${b}`;
    case 'caughtbowled': case 'candb': return `c & b ${b}`;
    case 'stumped': return `st ${catcher || 'keeper'} b ${b}`;
    case 'runout': return `run out${catcher ? ` (${catcher})` : ''}`;
    case 'hitwicket': return `hit wicket b ${b}`;
    default: return wicketType || 'out';
  }
}

// Full batting card built from the batting XI (in order) so EVERY batter shows —
// including run-out non-strikers who never faced a ball, and yet-to-bat players.
function computeBatting(innings, battingXI) {
  const fig = {};   // playerId -> figures (runs/balls off the bat)
  const dis = {};   // dismissedPlayerId -> howOut (covers non-facing run-outs too)
  const nameFromBall = {};
  (innings.oversData || []).forEach((over) => {
    (over.balls || []).forEach((ball) => {
      const id = ball.batterId;
      if (id) {
        if (ball.batter?.name) nameFromBall[id] = ball.batter.name;
        if (!fig[id]) fig[id] = { runs: 0, balls: 0, fours: 0, sixes: 0 };
        const et = ball.extraType;
        if (et !== 'wide' && et !== 'penalty') fig[id].balls += 1;          // faced
        if (!et || et === 'noBall') {                                        // runs off the bat
          fig[id].runs += ball.runs;
          if (ball.runs === 4) fig[id].fours += 1;
          if (ball.runs === 6) fig[id].sixes += 1;
        }
      }
      if (ball.isWicket && ball.dismissedPlayerId) {
        dis[ball.dismissedPlayerId] = formatDismissal(ball.wicketType, ball.wicketAssists, over.bowler?.name);
      }
    });
  });
  // Prefer the actual XI order; fall back to whoever appears in the ball log.
  const xi = (battingXI && battingXI.length)
    ? battingXI
    : [...new Set([...Object.keys(fig), ...Object.keys(dis)])].map((id) => ({ id, name: nameFromBall[id] || 'Unknown' }));
  const batted = [];
  const yetToBat = [];
  xi.forEach((p) => {
    const f = fig[p.id];
    const out = dis[p.id];
    if (f || out) {
      batted.push({
        name: p.name, runs: f?.runs || 0, balls: f?.balls || 0,
        fours: f?.fours || 0, sixes: f?.sixes || 0, out: !!out, howOut: out || '',
      });
    } else {
      yetToBat.push(p.name);
    }
  });
  return { batted, yetToBat };
}

// Bowling card from the ball log: overs from legal balls, runs actually charged to
// the bowler (byes/leg-byes excluded), wickets (run-outs not credited), maidens.
function computeBowling(innings) {
  const map = {};
  (innings.oversData || []).forEach((over) => {
    const id = over.bowlerId;
    if (!map[id]) map[id] = { name: over.bowler?.name || 'Unknown', legalBalls: 0, runs: 0, wickets: 0, maidens: 0 };
    let overRuns = 0, overLegal = 0;
    (over.balls || []).forEach((b) => {
      const et = b.extraType;
      let charged = 0, legal = false;
      if (et === 'wide') charged = b.extras;
      else if (et === 'noBall') charged = b.runs + b.extras;
      else if (et === 'bye' || et === 'legBye') legal = true;      // not charged
      else if (et === 'penalty') charged = 0;
      else { charged = b.runs; legal = true; }
      map[id].runs += charged; overRuns += charged;
      if (legal) { map[id].legalBalls += 1; overLegal += 1; }
      if (b.isWicket) {
        const wt = String(b.wicketType || '').toLowerCase().replace(/\s/g, '');
        if (wt !== 'runout' && wt !== 'retired') map[id].wickets += 1;
      }
    });
    if (overLegal >= 6 && overRuns === 0) map[id].maidens += 1;
  });
  return Object.values(map).map((b) => {
    const oversFloat = b.legalBalls / 6;
    return { ...b, overs: `${Math.floor(b.legalBalls / 6)}.${b.legalBalls % 6}`, economy: oversFloat > 0 ? (b.runs / oversFloat).toFixed(1) : '0.0' };
  });
}

// Total overs bowled in the innings (from legal balls) → "X.Y".
function inningsOvers(innings) {
  let legal = 0;
  (innings.oversData || []).forEach((over) => (over.balls || []).forEach((b) => {
    if (!['wide', 'noBall', 'penalty'].includes(b.extraType)) legal += 1;
  }));
  return `${Math.floor(legal / 6)}.${legal % 6}`;
}

// Extras breakdown: byes / leg-byes / wides / no-balls / penalty + total.
function computeExtras(innings) {
  const e = { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0, total: 0 };
  (innings.oversData || []).forEach((over) => (over.balls || []).forEach((b) => {
    if (b.extraType === 'bye') e.byes += b.extras;
    else if (b.extraType === 'legBye') e.legByes += b.extras;
    else if (b.extraType === 'wide') e.wides += b.extras;
    else if (b.extraType === 'noBall') e.noBalls += b.extras;
    else if (b.extraType === 'penalty') e.penalty += b.extras;
    e.total += (['bye', 'legBye', 'wide', 'noBall', 'penalty'].includes(b.extraType) ? b.extras : 0);
  }));
  return e;
}

// Fall of Wickets: "score-wicket (Batter, over.ball)" in the order they fell.
function computeFOW(innings, nameById) {
  const fow = [];
  let running = 0, wkts = 0, legal = 0;
  (innings.oversData || []).forEach((over) => (over.balls || []).forEach((b) => {
    running += b.runs + b.extras;
    if (!['wide', 'noBall', 'penalty'].includes(b.extraType)) legal += 1;
    if (b.isWicket) {
      wkts += 1;
      fow.push({ wkt: wkts, score: running, name: nameById[b.dismissedPlayerId] || 'batter', over: `${Math.floor(legal / 6)}.${legal % 6}` });
    }
  }));
  return fow;
}

function TableHeader({ cols }) {const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.tableHeader}>
      {cols.map((c, i) =>
      <Text key={i} style={[styles.cell, i === 0 ? styles.nameCol : styles.numCol, styles.headerCell]}>{c}</Text>
      )}
    </View>);

}

function InningsBlock({ innings, index, squads }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const battingXI = (squads || [])
    .filter((s) => s.teamId === innings.battingTeamId)
    .map((s) => ({ id: s.playerId, name: s.player?.name || 'Unknown' }));
  const nameById = Object.fromEntries((squads || []).map((s) => [s.playerId, s.player?.name || 'batter']));
  const { batted, yetToBat } = computeBatting(innings, battingXI);
  const bowlers = computeBowling(innings);
  const extras = computeExtras(innings);
  const fow = computeFOW(innings, nameById);
  const label = index === 0 ? '1st' : '2nd';

  return (
    <View style={styles.inningsCard}>
      {/* Batting section */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.inningsIndicator} />
          <Text style={styles.sectionHeaderText}>
            {(innings.battingTeam?.name || 'TEAM').toUpperCase()} BATTING
          </Text>
        </View>
        <Text style={styles.inningsLabel}>{label} Innings</Text>
      </View>

      <View style={styles.inningsScoreBanner}>
        <Text style={styles.inningsScore}>{innings.totalRuns}/{innings.totalWickets}</Text>
        <Text style={styles.inningsOvers}>({inningsOvers(innings)} ov)</Text>
      </View>

      <TableHeader cols={['BATTER', 'R', 'B', '4s', '6s', 'SR']} />
      {batted.map((b, i) =>
      <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
          <View style={[styles.cell, styles.nameCol]}>
            <Text style={styles.batterName}>{b.name}</Text>
            <Text style={b.out ? styles.howOut : styles.notOut}>{b.out ? b.howOut : 'not out'}</Text>
          </View>
          <Text style={[styles.cell, styles.numCol, b.runs >= 50 && styles.highlight]}>{b.runs}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.balls}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.fours}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.sixes}</Text>
          <Text style={[styles.cell, styles.numCol]}>
            {b.balls > 0 ? (b.runs / b.balls * 100).toFixed(0) : '0'}
          </Text>
        </View>
      )}
      {/* Extras + Total */}
      <View style={styles.extrasRow}>
        <Text style={styles.extrasLabel}>Extras</Text>
        <Text style={styles.extrasDetail}>
          (b {extras.byes}, lb {extras.legByes}, w {extras.wides}, nb {extras.noBalls}{extras.penalty ? `, p ${extras.penalty}` : ''})
        </Text>
        <Text style={styles.extrasVal}>{extras.total}</Text>
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL</Text>
        <Text style={styles.totalDetail}>({inningsOvers(innings)} ov)</Text>
        <Text style={styles.totalVal}>{innings.totalRuns}/{innings.totalWickets}</Text>
      </View>

      {yetToBat.length > 0 &&
        <View style={styles.yetToBatRow}>
          <Text style={styles.yetToBatLabel}>Yet to bat: </Text>
          <Text style={styles.yetToBatNames}>{yetToBat.join(', ')}</Text>
        </View>
      }

      {fow.length > 0 &&
        <View style={styles.fowBox}>
          <Text style={styles.fowTitle}>FALL OF WICKETS</Text>
          <Text style={styles.fowText}>
            {fow.map((f) => `${f.score}-${f.wkt} (${f.name}, ${f.over})`).join('   ')}
          </Text>
        </View>
      }

      {/* Bowling section */}
      <View style={[styles.sectionHeaderRow, { marginTop: 18 }]}>
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.inningsIndicator, { backgroundColor: DS.coral }]} />
          <Text style={styles.sectionHeaderText}>
            {(innings.bowlingTeam?.name || 'TEAM').toUpperCase()} BOWLING
          </Text>
        </View>
      </View>

      <TableHeader cols={['BOWLER', 'O', 'M', 'R', 'W', 'ECON']} />
      {bowlers.map((b, i) =>
      <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
          <Text style={[styles.cell, styles.nameCol, styles.bowlerName]}>{b.name}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.overs}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.maidens}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.runs}</Text>
          <Text style={[styles.cell, styles.numCol, b.wickets >= 3 && styles.highlight]}>{b.wickets}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.economy}</Text>
        </View>
      )}
    </View>);

}

export default function ScorecardScreen({ route, navigation }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const { matchId } = route.params || {};
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inningsTab, setInningsTab] = useState(0);   // which innings/team scorecard to show

  useLayoutEffect(() => {
    // Hide the stack header — the branded bar below is the single header, giving the
    // scorecard the full screen (no duplicate "Scorecard" bar eating vertical space).
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    legendsApi.getScorecard(matchId).
    then((res) => {if (res.success) setMatch(res.data);}).
    finally(() => setLoading(false));
  }, [matchId]);

  const shareScorecard = async () => {
    if (!match) return;
    const t1 = match.team1?.name || 'Team 1';
    const t2 = match.team2?.name || 'Team 2';
    try {
      await Share.share({
        message: `🏏 Scorecard: ${t1} vs ${t2}\n${match.score1 || '—'} | ${match.score2 || '—'}\n${match.result || ''}\nShared via Local Legends`
      });
    } catch {}
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>);

  }

  if (!match) {
    return (
      <View style={styles.centered}>
        <Icon name="alert-circle-outline" size={48} color={DS.coral} />
        <Text style={styles.errorText}>Scorecard not available</Text>
      </View>);

  }

  const t1 = match.team1?.name || 'Team 1';
  const t2 = match.team2?.name || 'Team 2';

  return (
    <View style={styles.container}>
      {/* Brand bar */}
      <View style={styles.brandBar}>
        {navigation &&
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-left" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
        }
        <Text style={styles.brandText}>LOCAL LEGENDS</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12 }}>
        {/* Compact score summary (both innings) — the big hero was redundant with
            the per-innings score banner, so it's dropped to give the tables room. */}
        <View style={styles.scoreSummary}>
          <View style={styles.scoreTeam}>
            <View style={[styles.scoreAvatar, { backgroundColor: DS.lime }]}>
              <Text style={styles.scoreAvatarText}>{t1[0]}</Text>
            </View>
            <Text style={styles.scoreTeamName} numberOfLines={1}>{t1}</Text>
            <Text style={styles.scoreValue}>{match.score1 || '—'}</Text>
          </View>
          <View style={styles.scoreVs}>
            <Text style={styles.scoreVsText}>VS</Text>
          </View>
          <View style={[styles.scoreTeam, { alignItems: 'flex-end' }]}>
            <View style={[styles.scoreAvatar, { backgroundColor: DS.coral }]}>
              <Text style={styles.scoreAvatarText}>{t2[0]}</Text>
            </View>
            <Text style={[styles.scoreTeamName, { textAlign: 'right' }]} numberOfLines={1}>{t2}</Text>
            <Text style={[styles.scoreValue, { textAlign: 'right' }]}>{match.score2 || '—'}</Text>
          </View>
        </View>

        {/* Result */}
        {match.result &&
        <View style={styles.resultBanner}>
            <Icon name="trophy" size={16} color={DS.lime} />
            <Text style={styles.resultBannerText}>{match.result}</Text>
          </View>
        }

        {/* Team / innings selector — tap a batting side to view its innings */}
        {(match.innings || []).length > 1 &&
          <View style={styles.inningsTabs}>
            {(match.innings || []).map((inn, i) => {
              const active = inningsTab === i;
              return (
                <TouchableOpacity key={inn.id || i} style={[styles.inningsTab, active && styles.inningsTabActive]}
                  onPress={() => setInningsTab(i)}>
                  <Text style={[styles.inningsTabText, active && styles.inningsTabTextActive]} numberOfLines={1}>
                    {(inn.battingTeam?.name || `Innings ${i + 1}`).toUpperCase()}
                  </Text>
                  <Text style={[styles.inningsTabSub, active && { color: DS.bg }]}>{i === 0 ? '1st' : '2nd'} inns</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        }

        {/* Selected innings */}
        <View style={styles.body}>
          {(() => {
            const list = match.innings || [];
            const inn = list[inningsTab] || list[0];
            return inn ? <InningsBlock key={inn.id || inningsTab} innings={inn} index={list.indexOf(inn)} squads={match.squads} /> : null;
          })()}
        </View>

        {/* WhatsApp Share */}
        <TouchableOpacity style={styles.shareBtn} onPress={shareScorecard}>
          <Icon name="whatsapp" size={20} color="#fff" />
          <Text style={styles.shareBtnText}>Share Scorecard</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>);

}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },
  errorText: { fontSize: 16, color: DS.textMuted, marginTop: 12, fontWeight: '600' },

  // Brand bar
  brandBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16
  },
  brandText: {
    fontSize: 13, fontWeight: '900', color: DS.lime, letterSpacing: 2
  },
  backBtn: { padding: 4 },

  // Hero
  hero: {
    alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16,
    backgroundColor: DS.bg
  },
  heroScore: { fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  heroOvers: { fontSize: 14, color: DS.textMuted, marginTop: 2 },
  heroMatchup: { fontSize: 16, fontWeight: '800', color: '#fff', marginTop: 10, letterSpacing: 0.5 },
  heroMeta: { fontSize: 12, color: DS.textMuted, marginTop: 4 },

  // Score summary
  scoreSummary: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: DS.surfaceHigh, marginHorizontal: 16,
    borderRadius: 14, padding: 16
  },
  scoreTeam: { flex: 1, alignItems: 'flex-start', gap: 4 },
  scoreAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  scoreAvatarText: { fontSize: 15, fontWeight: '900', color: DS.bg },
  scoreTeamName: { fontSize: 12, color: DS.textMuted, fontWeight: '600' },
  scoreValue: { fontSize: 20, fontWeight: '900', color: DS.lime },
  scoreVs: { paddingHorizontal: 12 },
  scoreVsText: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 1 },

  // Result
  resultBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(171,214,0,0.08)', marginHorizontal: 16, marginTop: 12,
    borderRadius: 10, paddingVertical: 10,
    borderLeftWidth: 4, borderLeftColor: DS.lime
  },
  resultBannerText: { fontSize: 14, fontWeight: '700', color: DS.textPrimary },

  // Tab switcher
  tabRow: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 16, marginBottom: 4,
    gap: 0
  },
  tabActive: {
    paddingVertical: 10, paddingHorizontal: 20,
    borderBottomWidth: 2, borderBottomColor: DS.lime
  },
  tabActiveText: { fontSize: 12, fontWeight: '800', color: DS.lime, letterSpacing: 1 },
  tabInactive: {
    paddingVertical: 10, paddingHorizontal: 20,
    borderBottomWidth: 2, borderBottomColor: 'transparent'
  },
  tabInactiveText: { fontSize: 12, fontWeight: '700', color: DS.textMuted, letterSpacing: 1 },

  body: { paddingHorizontal: 16, gap: 16, marginTop: 8 },

  // Team / innings tabs
  inningsTabs: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 14 },
  inningsTab: {
    flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8,
    alignItems: 'center', gap: 2,
  },
  inningsTabActive: { backgroundColor: DS.lime },
  inningsTabText: { fontSize: 12, fontWeight: '900', color: DS.textMuted, letterSpacing: 0.4 },
  inningsTabTextActive: { color: DS.bg },
  inningsTabSub: { fontSize: 10, fontWeight: '700', color: DS.textMuted },

  // Innings card
  inningsCard: {
    backgroundColor: DS.surfaceHigh, borderRadius: 14, overflow: 'hidden',
    paddingBottom: 8
  },

  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: DS.surfaceHighest
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inningsIndicator: {
    width: 4, height: 18, borderRadius: 2, backgroundColor: DS.lime
  },
  sectionHeaderText: {
    fontSize: 12, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.8
  },
  inningsLabel: { fontSize: 11, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.5 },
  inningsScoreBanner: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8
  },
  inningsScore: { fontSize: 26, fontWeight: '900', color: '#fff' },
  inningsOvers: { fontSize: 12, color: DS.textMuted },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: DS.surfaceHighest,
    paddingVertical: 8, paddingHorizontal: 12
  },
  tableRow: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12 },
  tableRowAlt: { backgroundColor: 'rgba(255,255,255,0.02)' },
  headerCell: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.5 },
  cell: { fontSize: 13, color: DS.textVariant },
  nameCol: { flex: 2.5 },
  numCol: { flex: 1, textAlign: 'center' },
  batterName: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  bowlerName: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  howOut: { fontSize: 10, color: DS.coral, marginTop: 1 },
  notOut: { fontSize: 10, color: DS.lime, marginTop: 1 },
  highlight: { color: DS.lime, fontWeight: '800' },
  yetToBatRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 8 },
  yetToBatLabel: { fontSize: 11, fontWeight: '700', color: DS.textMuted },
  yetToBatNames: { fontSize: 11, color: DS.textVariant, flex: 1 },

  extrasRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: DS.line, marginTop: 4 },
  extrasLabel: { fontSize: 12, fontWeight: '700', color: DS.textMuted, width: 52 },
  extrasDetail: { fontSize: 11, color: DS.textMuted, flex: 1 },
  extrasVal: { fontSize: 13, fontWeight: '800', color: DS.textPrimary },
  totalRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: DS.surfaceHigh, borderRadius: 8 },
  totalLabel: { fontSize: 13, fontWeight: '900', color: DS.textPrimary, width: 52, letterSpacing: 0.5 },
  totalDetail: { fontSize: 12, color: DS.textMuted, flex: 1 },
  totalVal: { fontSize: 16, fontWeight: '900', color: DS.lime },
  fowBox: { paddingHorizontal: 12, paddingTop: 10 },
  fowTitle: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 1, marginBottom: 4 },
  fowText: { fontSize: 11, color: DS.coral, lineHeight: 18 },

  // Share button
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#25D366', borderRadius: 14,
    paddingVertical: 14, marginHorizontal: 16, marginTop: 16
  },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' }
});