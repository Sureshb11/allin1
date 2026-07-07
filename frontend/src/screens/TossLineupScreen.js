import React, { useState, useEffect, useMemo, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ScrollView, ActivityIndicator, TextInput,
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
  blue:         c.blueDeep,
  onBlue:       c.onBlue,
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
function PlayerList({ teamId, teamName, color, xi, setXI, available, setAvailable }) {
  const c = useTheme().colors;
  const K = useMemo(() => makeK(c), [c]);
  const s = useMemo(() => makeS(K), [K]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    legendsApi.getTeam(teamId).then(res => {
      const list = res.success && Array.isArray(res.data?.players)
        ? res.data.players : [];
      setPlayers(list);
      // Auto-select all players (up to 11) so user just removes unavailable ones
      setXI(list.slice(0, 11).map(p => ({ id: p.id, name: p.name, role: p.role })));
      setLoading(false);
    });
  }, [teamId]);

  const toggleXI = (player) => {
    setXI(prev => {
      const inXI = prev.some(p => p.id === player.id);
      if (inXI) return prev.filter(p => p.id !== player.id);
      if (prev.length >= 11) { Alert.alert('XI Full', 'Deselect a player first.'); return prev; }
      return [...prev, { id: player.id, name: player.name, role: player.role }];
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

  const filteredPlayers = players.filter(p => (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <View>
      {/* Hero Banner */}
      <View style={s.heroContainer}>
        <View style={s.heroContent}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroTeamName}>{teamName.toUpperCase()}</Text>
            <Text style={s.heroSubtitle}>PRIMARY SQUAD</Text>
          </View>
          <View style={s.heroStats}>
            <Text style={s.heroCount}>{xi.length}/15</Text>
            <Text style={s.heroCountLabel}>PLAYERS PICKED</Text>
          </View>
        </View>
      </View>

      {/* Search Bar */}
      <View style={s.searchContainer}>
        <Icon name="magnify" size={20} color={K.textMuted} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          placeholder="Find player..."
          placeholderTextColor={K.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <TouchableOpacity style={s.filterBtn}>
          <Icon name="filter-variant" size={20} color={K.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Player List */}
      {filteredPlayers.map(p => {
        const inXI = xi.some(x => x.id === p.id);

        if (inXI) {
          return (
            <TouchableOpacity key={p.id} style={s.selectedCard} onPress={() => toggleXI(p)} activeOpacity={0.8}>
              <View style={s.avatarContainer}>
                <View style={[s.avatarBlue, { backgroundColor: color }]}>
                  <Text style={s.avatarInitials}>{(p.name || '?').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={s.roleBadge}>
                  <Text style={s.roleBadgeText}>{(p.role || 'P').charAt(0).toUpperCase()}</Text>
                </View>
              </View>
              <View style={s.nameContainer}>
                <Text style={s.playerNameSelected}>{p.name}</Text>
                <Text style={s.playerRoleSelected}>{(p.role || 'PLAYER').toUpperCase()}</Text>
              </View>
              <View style={s.actionRow}>
                <View style={s.actionIconBlue}><Icon name="cricket" size={14} color="#fff" /></View>
                <View style={s.actionIconCheck}><Icon name="check" size={16} color="#000" /></View>
              </View>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity key={p.id} style={s.unselectedCard} onPress={() => toggleXI(p)} activeOpacity={0.7}>
            <View style={s.avatarContainer}>
              <View style={s.avatarDark}>
                <Text style={s.avatarInitialsDark}>{(p.name || '?').charAt(0).toUpperCase()}</Text>
              </View>
            </View>
            <View style={s.nameContainer}>
              <Text style={s.playerNameUnselected}>{p.name}</Text>
              <Text style={s.playerRoleUnselected}>{(p.role || 'PLAYER').toUpperCase()}</Text>
            </View>
            <View style={s.addBtn}>
              <Icon name="plus" size={18} color={K.textMuted} />
            </View>
          </TouchableOpacity>
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

      // One transactional call: toss + inning-1 team fix + persist both XIs
      // (the old updateMatch was silently dropping the toss fields, and the
      // playing XI never reached the MatchPlayer table).
      await legendsApi.submitToss(matchId, {
        tossWinnerId: tossWinner === team1 ? team1Id : team2Id,
        tossDecision: decision.toLowerCase(),
        battingTeamId,
        bowlingTeamId,
        squads: [
          { teamId: team1Id, playerIds: team1XI.map((p) => p.id) },
          { teamId: team2Id, playerIds: team2XI.map((p) => p.id) },
        ],
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

            {/* Player list for active team */}
            <PlayerList
              key={activeTeam}
              teamId={teamIds[activeTeam]}
              teamName={teams[activeTeam]}
              color={teamColor[activeTeam]}
              xi={teamXIs[activeTeam]}
              setXI={setXIs[activeTeam]}
              available={teamAvail[activeTeam]}
              setAvailable={setAvails[activeTeam]}
            />

            {/* ── Bottom spacer for button ─────────────── */}
            <View style={{ height: 80 }} />
          </View>
        </View>
      </ScrollView>

      {/* ── Fixed bottom bar ──────────────────────────── */}
      {/* FAB */}
      <TouchableOpacity style={s.fab}>
        <Icon name="clipboard-check" size={24} color="#5C3B2E" />
      </TouchableOpacity>

      <View style={s.bottomBar}>
        <View style={s.selectionInfo}>
          <Text style={s.selectionLabel}>CURRENT SELECTION</Text>
          <View style={s.miniAvatarsRow}>
            {teamXIs[activeTeam].slice(0, 3).map((p, idx) => (
              <View key={p.id || idx} style={[s.miniAvatar, idx > 0 && { marginLeft: -8 }]}>
                <Text style={s.miniAvatarText}>{(p.name || '?').charAt(0).toUpperCase()}</Text>
              </View>
            ))}
            {teamXIs[activeTeam].length > 3 && (
              <View style={[s.miniBadge, { marginLeft: -8 }]}>
                <Text style={s.miniBadgeText}>+{teamXIs[activeTeam].length - 3}</Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={[s.proceedBtn, !canProceed && s.proceedBtnDisabled]}
          onPress={onProceed}
          disabled={loading || !canProceed}
          activeOpacity={0.8}
        >
          {loading ? <ActivityIndicator color="#000" /> : (
            <Text style={s.proceedBtnText}>
              {canProceed ? 'CONFIRM SQUAD' : `SELECT XI (${team1XI.length}+${team2XI.length})`}
            </Text>
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

  /* Squad Selection New Styles */
  heroContainer: {
    backgroundColor: K.surfaceLow, borderRadius: Radius.lg, padding: 20,
    marginBottom: Spacing.md, overflow: 'hidden', position: 'relative'
  },
  heroContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTeamName: { fontSize: 24, fontWeight: '900', color: K.textPrimary, fontStyle: 'italic', letterSpacing: 1 },
  heroSubtitle: { fontSize: 11, fontWeight: '800', color: K.lime, letterSpacing: 2, marginTop: 4 },
  heroStats: { alignItems: 'flex-end' },
  heroCount: { fontSize: 24, fontWeight: '900', color: K.textPrimary },
  heroCountLabel: { fontSize: 10, fontWeight: '700', color: K.blueDeep || '#3b82f6', letterSpacing: 1, marginTop: 2 },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: K.surfaceHigh,
    borderRadius: Radius.md, paddingHorizontal: 12, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: K.border
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 44, color: K.textPrimary, fontSize: 14 },
  filterBtn: {
    width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: K.surfaceTop,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8
  },

  selectedCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: K.blue,
    borderRadius: Radius.lg, padding: 12, marginBottom: 10
  },
  unselectedCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: K.surfaceHigh,
    borderRadius: Radius.lg, padding: 12, marginBottom: 10
  },
  
  avatarContainer: { position: 'relative', width: 44, height: 44, marginRight: 12 },
  avatarBlue: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: K.surfaceTop, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 18, fontWeight: '800', color: K.textPrimary },
  avatarDark: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: K.surfaceTop, alignItems: 'center', justifyContent: 'center' },
  avatarInitialsDark: { fontSize: 18, fontWeight: '800', color: K.textMuted },
  roleBadge: {
    position: 'absolute', bottom: -4, right: -4, backgroundColor: K.lime,
    borderRadius: 4, width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: K.blue
  },
  roleBadgeText: { fontSize: 10, fontWeight: '800', color: K.bg },

  nameContainer: { flex: 1 },
  playerNameSelected: { fontSize: 15, fontWeight: '800', color: K.textPrimary },
  playerRoleSelected: { fontSize: 10, fontWeight: '600', color: K.onBlue + 'CC', marginTop: 2, letterSpacing: 0.5 },
  playerNameUnselected: { fontSize: 15, fontWeight: '800', color: K.textPrimary },
  playerRoleUnselected: { fontSize: 10, fontWeight: '600', color: K.textMuted, marginTop: 2, letterSpacing: 0.5 },

  actionRow: { flexDirection: 'row', gap: 6 },
  actionIconBlue: { width: 28, height: 28, borderRadius: 6, backgroundColor: K.onBlue + '33', alignItems: 'center', justifyContent: 'center' },
  actionIconCheck: { width: 28, height: 28, borderRadius: 6, backgroundColor: K.lime, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: K.textMuted, alignItems: 'center', justifyContent: 'center' },

  loaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 24, justifyContent: 'center' },
  loaderText: { fontSize: 13, color: K.textMuted },
  emptyBox: { alignItems: 'center', paddingVertical: 32, gap: 6 },
  emptyText: { fontSize: 14, fontWeight: '600', color: K.textVariant },
  emptyHint: { fontSize: 12, color: K.textMuted },

  selectionInfo: { flex: 1 },
  selectionLabel: { fontSize: 10, fontWeight: '800', color: K.lime, letterSpacing: 1, marginBottom: 6 },
  miniAvatarsRow: { flexDirection: 'row', alignItems: 'center' },
  miniAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: K.blue, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: K.surfaceLow },
  miniAvatarText: { fontSize: 10, fontWeight: '700', color: K.textPrimary },
  miniBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: K.blue, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: K.surfaceLow },
  miniBadgeText: { fontSize: 10, fontWeight: '700', color: K.textPrimary },

  fab: {
    position: 'absolute', top: -20, right: Spacing.md,
    width: 48, height: 48, borderRadius: Radius.lg, backgroundColor: K.textVariant,
    alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    zIndex: 10
  },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: K.surfaceLow,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: K.border,
    gap: 12,
  },

  proceedBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: K.lime, borderRadius: Radius.md,
    paddingVertical: 14, elevation: 2,
  },
  proceedBtnDisabled: { opacity: 0.5 },
  proceedBtnText: {
    fontSize: 14, fontWeight: '900', color: K.bg,
    letterSpacing: 0.5,
  }
});
