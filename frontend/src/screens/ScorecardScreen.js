import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

const DS = {
  bg: '#0f131f',
  surfaceLow: '#171b28',
  surfaceHigh: '#262a37',
  surfaceHighest: '#313442',
  lime: '#abd600',
  coral: '#ffb59e',
  blue: '#b7c4ff',
  textPrimary: '#dfe2f3',
  textVariant: '#c3c5d9',
  textMuted: '#8d90a2',
};

function computeBatting(innings) {
  const map = {};
  (innings.oversData || []).forEach(over => {
    (over.balls || []).forEach(ball => {
      const id = ball.batterId;
      if (!map[id]) map[id] = { name: ball.batter?.name || 'Unknown', runs: 0, balls: 0, fours: 0, sixes: 0, out: false, howOut: '' };
      map[id].runs += ball.runs;
      if (ball.extraType !== 'wide') map[id].balls += 1;
      if (ball.runs === 4) map[id].fours += 1;
      if (ball.runs === 6) map[id].sixes += 1;
      if (ball.isWicket && ball.dismissedPlayerId === id) { map[id].out = true; map[id].howOut = ball.wicketType || 'out'; }
    });
  });
  return Object.values(map);
}

function computeBowling(innings) {
  const map = {};
  (innings.oversData || []).forEach(over => {
    const id = over.bowlerId;
    if (!map[id]) map[id] = { name: over.bowler?.name || 'Unknown', overs: 0, runs: 0, wickets: 0, extras: 0 };
    map[id].overs   += 1;
    map[id].runs    += over.runs;
    map[id].wickets += over.wickets;
    map[id].extras  += over.extras;
  });
  return Object.values(map).map(b => ({ ...b, economy: b.overs > 0 ? ((b.runs + b.extras) / b.overs).toFixed(1) : '0.0' }));
}

function TableHeader({ cols }) {
  return (
    <View style={styles.tableHeader}>
      {cols.map((c, i) => (
        <Text key={i} style={[styles.cell, i === 0 ? styles.nameCol : styles.numCol, styles.headerCell]}>{c}</Text>
      ))}
    </View>
  );
}

function InningsBlock({ innings, index }) {
  const batters = computeBatting(innings);
  const bowlers = computeBowling(innings);
  const label   = index === 0 ? '1st' : '2nd';

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
        <Text style={styles.inningsOvers}>({innings.totalOvers ?? '—'} ov)</Text>
      </View>

      <TableHeader cols={['BATTER', 'R', 'B', '4s', '6s', 'SR']} />
      {batters.map((b, i) => (
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
            {b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(0) : '0'}
          </Text>
        </View>
      ))}

      {/* Bowling section */}
      <View style={[styles.sectionHeaderRow, { marginTop: 20 }]}>
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.inningsIndicator, { backgroundColor: DS.coral }]} />
          <Text style={styles.sectionHeaderText}>
            {(innings.bowlingTeam?.name || 'TEAM').toUpperCase()} BOWLING
          </Text>
        </View>
      </View>

      <TableHeader cols={['BOWLER', 'O', 'R', 'W', 'ECON']} />
      {bowlers.map((b, i) => (
        <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
          <Text style={[styles.cell, styles.nameCol, styles.bowlerName]}>{b.name}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.overs}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.runs + b.extras}</Text>
          <Text style={[styles.cell, styles.numCol, b.wickets >= 3 && styles.highlight]}>{b.wickets}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.economy}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ScorecardScreen({ route, navigation }) {
  const { matchId } = route.params || {};
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    legendsApi.getScorecard(matchId)
      .then(res => { if (res.success) setMatch(res.data); })
      .finally(() => setLoading(false));
  }, [matchId]);

  const shareScorecard = async () => {
    if (!match) return;
    const t1 = match.team1?.name || 'Team 1';
    const t2 = match.team2?.name || 'Team 2';
    try {
      await Share.share({
        message: `🏏 Scorecard: ${t1} vs ${t2}\n${match.score1 || '—'} | ${match.score2 || '—'}\n${match.result || ''}\nShared via AllIn1 Cricket`,
      });
    } catch {}
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>
    );
  }

  if (!match) {
    return (
      <View style={styles.centered}>
        <Icon name="alert-circle-outline" size={48} color={DS.coral} />
        <Text style={styles.errorText}>Scorecard not available</Text>
      </View>
    );
  }

  const t1 = match.team1?.name || 'Team 1';
  const t2 = match.team2?.name || 'Team 2';

  return (
    <View style={styles.container}>
      {/* Brand bar */}
      <View style={styles.brandBar}>
        {navigation && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-left" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={styles.brandText}>LOCAL LEGENDS</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero score section */}
        <View style={styles.hero}>
          <Text style={styles.heroScore}>{match.score1 || '—'}</Text>
          <Text style={styles.heroOvers}>
            {match.innings?.[0]?.totalOvers ? `(${match.innings[0].totalOvers})` : ''}
          </Text>
          <Text style={styles.heroMatchup}>
            {t1.toUpperCase()} vs {t2.toUpperCase()}
          </Text>
          <Text style={styles.heroMeta}>
            {[match.venue, match.matchType].filter(Boolean).join(' · ')}
          </Text>
        </View>

        {/* Score summary row */}
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
        {match.result && (
          <View style={styles.resultBanner}>
            <Icon name="trophy" size={16} color={DS.lime} />
            <Text style={styles.resultBannerText}>{match.result}</Text>
          </View>
        )}

        {/* Tab switcher */}
        <View style={styles.tabRow}>
          <View style={styles.tabActive}>
            <Text style={styles.tabActiveText}>SCORECARD</Text>
          </View>
          <View style={styles.tabInactive}>
            <Text style={styles.tabInactiveText}>PARTNERSHIPS</Text>
          </View>
        </View>

        {/* Innings */}
        <View style={styles.body}>
          {(match.innings || []).map((inn, i) => (
            <InningsBlock key={inn.id || i} innings={inn} index={i} />
          ))}
        </View>

        {/* WhatsApp Share */}
        <TouchableOpacity style={styles.shareBtn} onPress={shareScorecard}>
          <Icon name="whatsapp" size={20} color="#fff" />
          <Text style={styles.shareBtnText}>Share Scorecard</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },
  errorText: { fontSize: 16, color: DS.textMuted, marginTop: 12, fontWeight: '600' },

  // Brand bar
  brandBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16,
  },
  brandText: {
    fontSize: 13, fontWeight: '900', color: DS.lime, letterSpacing: 2,
  },
  backBtn: { padding: 4 },

  // Hero
  hero: {
    alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16,
    backgroundColor: DS.bg,
  },
  heroScore: { fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  heroOvers: { fontSize: 14, color: DS.textMuted, marginTop: 2 },
  heroMatchup: { fontSize: 16, fontWeight: '800', color: '#fff', marginTop: 10, letterSpacing: 0.5 },
  heroMeta: { fontSize: 12, color: DS.textMuted, marginTop: 4 },

  // Score summary
  scoreSummary: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: DS.surfaceHigh, marginHorizontal: 16,
    borderRadius: 14, padding: 16,
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
    borderLeftWidth: 4, borderLeftColor: DS.lime,
  },
  resultBannerText: { fontSize: 14, fontWeight: '700', color: DS.textPrimary },

  // Tab switcher
  tabRow: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 16, marginBottom: 4,
    gap: 0,
  },
  tabActive: {
    paddingVertical: 10, paddingHorizontal: 20,
    borderBottomWidth: 2, borderBottomColor: DS.lime,
  },
  tabActiveText: { fontSize: 12, fontWeight: '800', color: DS.lime, letterSpacing: 1 },
  tabInactive: {
    paddingVertical: 10, paddingHorizontal: 20,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabInactiveText: { fontSize: 12, fontWeight: '700', color: DS.textMuted, letterSpacing: 1 },

  body: { paddingHorizontal: 16, gap: 16, marginTop: 8 },

  // Innings card
  inningsCard: {
    backgroundColor: DS.surfaceHigh, borderRadius: 14, overflow: 'hidden',
    paddingBottom: 8,
  },

  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: DS.surfaceHighest,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inningsIndicator: {
    width: 4, height: 18, borderRadius: 2, backgroundColor: DS.lime,
  },
  sectionHeaderText: {
    fontSize: 12, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.8,
  },
  inningsLabel: { fontSize: 11, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.5 },
  inningsScoreBanner: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  inningsScore: { fontSize: 26, fontWeight: '900', color: '#fff' },
  inningsOvers: { fontSize: 12, color: DS.textMuted },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: DS.surfaceHighest,
    paddingVertical: 8, paddingHorizontal: 12,
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

  // Share button
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#25D366', borderRadius: 14,
    paddingVertical: 14, marginHorizontal: 16, marginTop: 16,
  },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
