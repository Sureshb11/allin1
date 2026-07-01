import React, { useState, useEffect, useMemo, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Spacing, Radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import legendsApi from '../services/LegendsApi';

/* ─── Kinetic Athlete Design Tokens ───────────────────────── */
const makeK = (c) => ({
  bg:           c.bg,
  surfaceLow:   c.surfaceLow,
  surfaceHigh:  c.surfaceHigh,
  surfaceTop:   c.surfaceHighest,
  lime:         c.lime,
  limeDark:     c.limeDark,
  textPrimary:  c.textPrimary,
  textVariant:  c.textVariant,
  textMuted:    c.textMuted,
  red:          c.live,
  border:       c.surfaceHighest,
  borderLight:  c.border,
});

/* ─── PlayerList ─────────────────────────────────────────────
   Shows players for one team. Green tick = available today.
   XI box = selected in playing eleven.
────────────────────────────────────────────────────────────── */
function PlayerList({ teamId, color, xi, setXI, available, setAvailable }) {
  const c = useTheme().colors;
  const K = useMemo(() => makeK(c), [c]);
  const s = useMemo(() => makeS(K), [K]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    legendsApi.getTeam(teamId).then(res => {
      const list = res.success && Array.isArray(res.data?.players)
        ? res.data.players : [];
      setPlayers(list);
      const av = {};
      list.forEach(p => { av[p.id] = true; });
      setAvailable(av);
      // Auto-select all players (up to 11) so user just removes unavailable ones
      setXI(list.slice(0, 11).map(p => ({ id: p.id, name: p.name })));
      setLoading(false);
    });
  }, [teamId]);

  const toggleAvail = (id) => {
    setAvailable(prev => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) {
        // deselect from XI if marked unavailable
        setXI(prev2 => prev2.filter(p => p.id !== id));
      }
      return next;
    });
  };

  const toggleXI = (player) => {
    setXI(prev => {
      const inXI = prev.some(p => p.id === player.id);
      if (inXI) return prev.filter(p => p.id !== player.id);
      if (prev.length >= 11) { Alert.alert('XI Full', 'Deselect a player first.'); return prev; }
      return [...prev, { id: player.id, name: player.name }];
    });
  };

  if (loading) return (
    <View style={s.loaderRow}>
      <ActivityIndicator size="small" color={K.lime} />
      <Text style={s.loaderText}>Loading players...</Text>
    </View>
  );

  if (players.length === 0) return (
    <View style={s.emptyBox}>
      <Icon name="account-group-outline" size={32} color={K.textMuted} />
      <Text style={s.emptyText}>No players added yet</Text>
      <Text style={s.emptyHint}>Add players via Team Management</Text>
    </View>
  );

  return (
    <View>
      {players.map(p => {
        const isAvail = !!available[p.id];
        const inXI    = xi.some(x => x.id === p.id);
        return (
          <View
            key={p.id}
            style={[
              s.playerRow,
              { borderLeftColor: inXI ? K.lime : isAvail ? K.surfaceTop : K.red + '55' },
            ]}
          >
            {/* Available toggle */}
            <TouchableOpacity onPress={() => toggleAvail(p.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon
                name={isAvail ? 'check-circle' : 'circle-outline'}
                size={22}
                color={isAvail ? K.lime : K.textMuted}
              />
            </TouchableOpacity>

            {/* Avatar */}
            <View style={[s.pAvatar, { backgroundColor: isAvail ? color + '33' : K.surfaceTop }]}>
              <Text style={[s.pInitial, { color: isAvail ? color : K.textMuted }]}>
                {(p.name || '?').charAt(0).toUpperCase()}
              </Text>
            </View>

            {/* Name + role */}
            <View style={{ flex: 1 }}>
              <Text style={[s.pName, !isAvail && s.pNameOut]}>{p.name}</Text>
              <Text style={s.pRole}>{(p.role || 'Player').toUpperCase()}</Text>
            </View>

            {/* Unavailable badge */}
            {!isAvail && (
              <View style={s.outBadge}>
                <Text style={s.outBadgeText}>OUT</Text>
              </View>
            )}

            {/* XI checkbox */}
            {isAvail && (
              <TouchableOpacity
                style={[s.xiBox, inXI && { backgroundColor: K.lime, borderColor: K.lime }]}
                onPress={() => toggleXI(p)}
              >
                {inXI
                  ? <Icon name="check" size={13} color={K.bg} />
                  : <Text style={s.xiLabel}>XI</Text>}
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

/* ─── TossLineupScreen ─────────────────────────────────────── */
export default function TossLineupScreen({ route, navigation }) {
  const c = useTheme().colors;
  const K = useMemo(() => makeK(c), [c]);
  const s = useMemo(() => makeS(K), [K]);
  const { team1, team2, overs, venue, matchType, matchId, team1Id, team2Id, firstInningId, sport } = route.params || {};

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Toss & Lineup',
    });
  }, [navigation]);
  const sportId = sport?.id || 'cricket';

  const [tossWinner, setTossWinner] = useState(team1);
  const [decision, setDecision]     = useState('Bat');
  const [activeTeam, setActiveTeam] = useState(0); // 0 = team1, 1 = team2

  const [team1XI, setTeam1XI]           = useState([]);
  const [team2XI, setTeam2XI]           = useState([]);
  const [team1Avail, setTeam1Avail]     = useState({});
  const [team2Avail, setTeam2Avail]     = useState({});
  const [loading, setLoading]           = useState(false);

  const canProceed = team1XI.length >= 1 && team2XI.length >= 1;

  const autoPickTeam = (allAvail, setXI, teamId) => {
    legendsApi.getTeam(teamId).then(res => {
      const list = res.success && Array.isArray(res.data?.players) ? res.data.players : [];
      const avail = list.filter(p => allAvail[p.id]);
      setXI(avail.slice(0, 11).map(p => ({ id: p.id, name: p.name })));
    });
  };

  const onProceed = async () => {
    if (team1XI.length < 1) return Alert.alert('Missing XI', `Select at least 1 player for ${team1}`);
    if (team2XI.length < 1) return Alert.alert('Missing XI', `Select at least 1 player for ${team2}`);

    setLoading(true);
    try {
      const battingTeamId = decision === 'Bat'
        ? (tossWinner === team1 ? team1Id : team2Id)
        : (tossWinner === team1 ? team2Id : team1Id);
      const bowlingTeamId = battingTeamId === team1Id ? team2Id : team1Id;

      await legendsApi.updateMatch(matchId, {
        status: 'live',
        tossWinnerId: tossWinner === team1 ? team1Id : team2Id,
        tossDecision: decision.toLowerCase(),
      });

      const battingXI = battingTeamId === team1Id ? team1XI : team2XI;
      const bowlingXI = bowlingTeamId === team1Id ? team1XI : team2XI;

      const scoringScreen = sportId === 'cricket' ? 'Scoring' : 'SportScoring';
      navigation.navigate(scoringScreen, {
        match: {
          id: matchId, team1, team2, overs, venue, matchType, sport: sportId,
          tossWinner, decision,
          team1XI: team1XI.map(p => p.name),
          team2XI: team2XI.map(p => p.name),
          team1Id, team2Id,
          team1PlayerIds: team1XI,
          team2PlayerIds: team2XI,
          battingTeamId, bowlingTeamId,
          battingTeamName: battingTeamId === team1Id ? team1 : team2,
          bowlingTeamName: bowlingTeamId === team1Id ? team1 : team2,
          battingXI, bowlingXI,
          firstInningId, status: 'live',
        },
      });
    } catch {
      Alert.alert('Error', 'Failed to set up match. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const teams     = [team1, team2];
  const teamIds   = [team1Id, team2Id];
  const teamXIs   = [team1XI, team2XI];
  const setXIs    = [setTeam1XI, setTeam2XI];
  const teamAvail = [team1Avail, team2Avail];
  const setAvails = [setTeam1Avail, setTeam2Avail];
  const teamColor = [K.lime, '#4fc3f7'];

  return (
    <View style={s.root}>
      {/* ── Header ────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon name="arrow-left" size={22} color={K.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerBrand}>KINETIC SCORER</Text>
          <Text style={s.headerTitle}>TOSS & SQUAD SELECTION</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.body}>

          {/* ── Match info banner ─────────────────────── */}
          <View style={s.matchBanner}>
            <Text style={s.matchTeams}>{team1} vs {team2}</Text>
            <Text style={s.matchMeta}>{overs} overs  |  {matchType}  |  {venue || 'TBD'}</Text>
          </View>

          {/* ── Toss Winner ────────────────────────────── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Icon name="trophy-outline" size={16} color={K.lime} />
              <Text style={s.sectionTitle}>TOSS WINNER</Text>
            </View>
            <View style={s.chipRow}>
              {[team1, team2].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[s.chip, tossWinner === t && s.chipActive]}
                  onPress={() => setTossWinner(t)}
                >
                  <Text style={[s.chipText, tossWinner === t && s.chipTextActive]} numberOfLines={1}>{t}</Text>
                  {tossWinner === t && <Icon name="check-circle" size={15} color={K.bg} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Decision ───────────────────────────────── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Icon name="swap-horizontal" size={16} color={K.lime} />
              <Text style={s.sectionTitle}>ELECTED TO</Text>
            </View>
            <View style={s.chipRow}>
              {['Bat', 'Bowl'].map(d => (
                <TouchableOpacity
                  key={d}
                  style={[s.chip, decision === d && s.chipActive]}
                  onPress={() => setDecision(d)}
                >
                  <Icon name={d === 'Bat' ? 'cricket' : 'weather-windy'} size={16}
                    color={decision === d ? K.bg : K.textMuted} />
                  <Text style={[s.chipText, decision === d && s.chipTextActive]}>{d.toUpperCase()}</Text>
                  {decision === d && <Icon name="check-circle" size={15} color={K.bg} />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Summary pill */}
            <View style={s.summaryPill}>
              <Icon name="information-outline" size={14} color={K.lime} />
              <Text style={s.summaryText}>
                <Text style={{ fontWeight: '800', color: K.textPrimary }}>{tossWinner}</Text>
                {' '}won the toss — elected to{' '}
                <Text style={{ fontWeight: '800', color: K.lime }}>{decision}</Text> first
              </Text>
            </View>
          </View>

          {/* ── Playing XI ────────────────────────────── */}
          <View style={s.section}>
            {/* Team tab switcher */}
            <View style={s.teamTabs}>
              {teams.map((t, i) => {
                const active = activeTeam === i;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[s.teamTab, active && { borderBottomColor: teamColor[i] }]}
                    onPress={() => setActiveTeam(i)}
                  >
                    <View style={[s.teamTabDot, { backgroundColor: active ? teamColor[i] : K.textMuted }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.teamTabName, active && { color: K.textPrimary }]} numberOfLines={1}>
                        {t}
                      </Text>
                      <Text style={s.teamTabCount}>
                        <Text style={{ color: K.lime, fontWeight: '800' }}>{teamXIs[i].length}</Text>
                        <Text style={{ color: K.textMuted }}>/11 selected</Text>
                      </Text>
                    </View>
                    {teamXIs[i].length >= 11 && (
                      <Icon name="check-circle" size={16} color={K.lime} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Active team name large */}
            <Text style={s.activeTeamName}>{teams[activeTeam]}</Text>
            <Text style={s.primarySquadLabel}>PRIMARY SQUAD</Text>

            {/* Legend */}
            <View style={s.legendRow}>
              <Icon name="check-circle" size={13} color={K.lime} />
              <Text style={s.legendText}>Available</Text>
              <View style={s.legendDivider} />
              <View style={[s.xiBox, { backgroundColor: K.lime, borderColor: K.lime, width: 20, height: 20 }]}>
                <Icon name="check" size={10} color={K.bg} />
              </View>
              <Text style={s.legendText}>In Playing XI</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={s.autoBtn}
                onPress={() => autoPickTeam(teamAvail[activeTeam], setXIs[activeTeam], teamIds[activeTeam])}
              >
                <Icon name="auto-fix" size={13} color={K.lime} />
                <Text style={s.autoBtnText}>Auto-pick</Text>
              </TouchableOpacity>
            </View>

            {/* Player list for active team */}
            <PlayerList
              key={activeTeam}
              teamId={teamIds[activeTeam]}
              color={teamColor[activeTeam]}
              xi={teamXIs[activeTeam]}
              setXI={setXIs[activeTeam]}
              available={teamAvail[activeTeam]}
              setAvailable={setAvails[activeTeam]}
            />

            {/* XI confirmation bar */}
            {teamXIs[activeTeam].length > 0 && (
              <View style={s.xiBar}>
                <Icon name="account-group" size={15} color={K.lime} />
                <Text style={s.xiBarText}>
                  {teamXIs[activeTeam].length === 11
                    ? `${teams[activeTeam]} XI confirmed`
                    : `${teamXIs[activeTeam].length}/11 -- ${teamXIs[activeTeam].map(p => p.name).join(', ')}`}
                </Text>
              </View>
            )}
          </View>

          {/* ── Bottom spacer for button ─────────────── */}
          <View style={{ height: 80 }} />
        </View>
      </ScrollView>

      {/* ── Fixed bottom bar ──────────────────────────── */}
      <View style={s.bottomBar}>
        <View style={s.selectionCount}>
          <Text style={s.selectionLabel}>CURRENT SELECTION</Text>
          <Text style={s.selectionNumbers}>
            <Text style={{ color: K.lime }}>{team1XI.length}</Text>
            <Text style={{ color: K.textMuted }}> + </Text>
            <Text style={{ color: K.lime }}>{team2XI.length}</Text>
          </Text>
        </View>
        <TouchableOpacity
          style={[s.proceedBtn, !canProceed && s.proceedBtnDisabled]}
          onPress={onProceed}
          disabled={loading || !canProceed}
          activeOpacity={0.8}
        >
          {loading ? <ActivityIndicator color={K.bg} /> : (
            <>
              <Icon name="play-circle" size={18} color={K.bg} />
              <Text style={s.proceedBtnText}>
                {canProceed ? 'PROCEED TO SCORING' : `SELECT XI (${team1XI.length}+${team2XI.length})`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ─── Styles ───────────────────────────────────────────────── */
const makeS = (K) => StyleSheet.create({
  root: { flex: 1, backgroundColor: K.bg },

  /* Header */
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: K.surfaceLow,
    paddingTop: 54, paddingBottom: 16, paddingHorizontal: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: K.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: K.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  headerBrand: {
    fontSize: 10, fontWeight: '800', letterSpacing: 2,
    color: K.lime, marginBottom: 2,
  },
  headerTitle: {
    fontSize: 18, fontWeight: '800', letterSpacing: 0.5,
    color: K.textPrimary,
  },

  /* Body */
  body: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },

  /* Match banner */
  matchBanner: {
    backgroundColor: K.surfaceLow,
    borderRadius: Radius.md, padding: 14,
    borderLeftWidth: 3, borderLeftColor: K.lime,
    marginBottom: Spacing.md,
  },
  matchTeams: {
    fontSize: 16, fontWeight: '800', color: K.textPrimary,
    letterSpacing: 0.3,
  },
  matchMeta: {
    fontSize: 11, color: K.textMuted, marginTop: 4,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },

  /* Sections */
  section: {
    backgroundColor: K.surfaceLow,
    borderRadius: Radius.lg, overflow: 'hidden',
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: K.border,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.5,
    color: K.textMuted,
  },

  /* Chips */
  chipRow: { flexDirection: 'row', gap: 10 },
  chip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1.5, borderColor: K.border, borderRadius: Radius.md,
    paddingVertical: 11, paddingHorizontal: 10,
    backgroundColor: K.surfaceHigh,
  },
  chipActive: {
    backgroundColor: K.lime, borderColor: K.lime,
  },
  chipText: {
    fontSize: 13, fontWeight: '700', color: K.textVariant,
  },
  chipTextActive: {
    color: K.bg,
  },

  /* Summary */
  summaryPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    backgroundColor: K.surfaceHigh, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 10,
    borderLeftWidth: 3, borderLeftColor: K.lime,
  },
  summaryText: { flex: 1, fontSize: 12, color: K.textVariant, lineHeight: 18 },

  /* Team tabs */
  teamTabs: {
    flexDirection: 'row',
    marginHorizontal: -Spacing.md, marginTop: -Spacing.md,
    borderBottomWidth: 1, borderBottomColor: K.border,
    marginBottom: 16,
  },
  teamTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  teamTabDot: { width: 10, height: 10, borderRadius: 5 },
  teamTabName: {
    fontSize: 13, fontWeight: '700', color: K.textMuted,
  },
  teamTabCount: { fontSize: 11, marginTop: 1 },

  /* Active team display */
  activeTeamName: {
    fontSize: 22, fontWeight: '900', color: K.textPrimary,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  primarySquadLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.5,
    color: K.textMuted, marginTop: 2, marginBottom: 14,
  },

  /* Legend */
  legendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginBottom: 10, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: K.border,
  },
  legendText: { fontSize: 11, color: K.textMuted },
  legendDivider: { width: 1, height: 12, backgroundColor: K.border, marginHorizontal: 4 },
  autoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: K.lime + '55', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: K.lime + '11',
  },
  autoBtnText: { fontSize: 11, fontWeight: '700', color: K.lime },

  /* Player rows */
  loaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 24, justifyContent: 'center',
  },
  loaderText: { fontSize: 13, color: K.textMuted },
  emptyBox: { alignItems: 'center', paddingVertical: 32, gap: 6 },
  emptyText: { fontSize: 14, fontWeight: '600', color: K.textVariant },
  emptyHint: { fontSize: 12, color: K.textMuted },

  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingLeft: 12,
    borderBottomWidth: 1, borderBottomColor: K.border,
    borderLeftWidth: 3,
    backgroundColor: K.surfaceLow,
  },
  pAvatar: {
    width: 38, height: 38, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  pInitial: { fontSize: 15, fontWeight: '800' },
  pName: { fontSize: 14, fontWeight: '700', color: K.textPrimary },
  pNameOut: { color: K.textMuted, textDecorationLine: 'line-through' },
  pRole: {
    fontSize: 10, color: K.textMuted, marginTop: 2,
    fontWeight: '600', letterSpacing: 0.8,
  },

  outBadge: {
    backgroundColor: K.red + '22', borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: K.red + '33',
  },
  outBadgeText: { fontSize: 10, fontWeight: '700', color: K.red },

  xiBox: {
    width: 28, height: 28, borderRadius: 7,
    borderWidth: 1.5, borderColor: K.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: K.surfaceHigh,
  },
  xiLabel: { fontSize: 9, fontWeight: '800', color: K.textMuted },

  xiBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 14, borderRadius: Radius.md, padding: 12,
    backgroundColor: K.lime + '11',
    borderWidth: 1, borderColor: K.lime + '33',
  },
  xiBarText: { flex: 1, fontSize: 12, fontWeight: '600', color: K.lime },

  /* Bottom bar */
  bottomBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: K.surfaceLow,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: K.border,
    gap: 12,
  },
  selectionCount: { alignItems: 'center' },
  selectionLabel: {
    fontSize: 9, fontWeight: '700', letterSpacing: 1,
    color: K.textMuted, marginBottom: 2,
  },
  selectionNumbers: { fontSize: 18, fontWeight: '900' },

  proceedBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: K.lime, borderRadius: Radius.md,
    paddingVertical: 14,
  },
  proceedBtnDisabled: { opacity: 0.35 },
  proceedBtnText: {
    fontSize: 13, fontWeight: '800', color: K.bg,
    letterSpacing: 0.5,
  },
});
