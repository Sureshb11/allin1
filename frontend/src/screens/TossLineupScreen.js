import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ScrollView, ActivityIndicator, TextInput, Animated, Easing,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { Spacing, Radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { haptic } from '../utils/haptics';
import legendsApi from '../services/LegendsApi';

// Max players a side can pick. Local/tennis-ball games often run more than a
// standard XI, so we allow up to a 15-strong squad (matches the "/15" hero).
const MAX_XI = 15;

/* ─── Kinetic Athlete Design Tokens ───────────────────────── */
const makeK = (c) => ({
  bg:           c.bg,
  surfaceLow:   c.surfaceLow,
  surfaceHigh:  c.surfaceHigh,
  surfaceTop:   c.surfaceHighest,
  lime:         c.lime,
  limeDark:     c.limeDark,
  onLime:       c.onLime,
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
      // Auto-select all players (up to the squad max) so user just removes unavailable ones
      setXI(list.slice(0, MAX_XI).map(p => ({ id: p.id, name: p.name, role: p.role })));
      setLoading(false);
    });
  }, [teamId]);

  const toggleXI = (player) => {
    setXI(prev => {
      const inXI = prev.some(p => p.id === player.id);
      if (inXI) return prev.filter(p => p.id !== player.id);
      if (prev.length >= MAX_XI) { Alert.alert('Squad Full', `You can pick up to ${MAX_XI} players. Deselect one first.`); return prev; }
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
            <Text style={s.heroCount}>{xi.length}/{MAX_XI}</Text>
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

        const initial = (p.name || '?').charAt(0).toUpperCase();
        const role = (p.role || 'PLAYER').toUpperCase();

        if (inXI) {
          return (
            <TouchableOpacity key={p.id} style={s.playerCardSelected} onPress={() => toggleXI(p)} activeOpacity={0.8}>
              <View style={[s.pAvatar, { backgroundColor: color + '26' }]}>
                <Text style={s.pAvatarText}>{initial}</Text>
              </View>
              <View style={s.pInfo}>
                <Text style={s.pName} numberOfLines={1}>{p.name}</Text>
                <Text style={s.pRole}>{role}</Text>
              </View>
              <View style={s.pCheck}><Icon name="check" size={15} color={K.onLime} /></View>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity key={p.id} style={s.playerCardUnselected} onPress={() => toggleXI(p)} activeOpacity={0.7}>
            <View style={s.pAvatarDim}>
              <Text style={s.pAvatarTextDim}>{initial}</Text>
            </View>
            <View style={s.pInfo}>
              <Text style={s.pNameDim} numberOfLines={1}>{p.name}</Text>
              <Text style={s.pRole}>{role}</Text>
            </View>
            <View style={s.pAdd}><Icon name="plus" size={17} color={K.textMuted} /></View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ─── BatSvg — a cricket bat drawn two ways ───────────────────────────
   'flats' = the flat blade face (willow + team sticker); 'hills' = the
   rounded back with the central spine ridge. These are the two outcomes a
   bat-flip toss lands on ("hills or flats", à la the Big Bash League). */
function BatSvg({ face, accent }) {
  const flats = face === 'flats';
  const willow = flats ? '#e7d2a6' : '#d7bc8b';
  const grip = '#2c2723';
  // Drawn horizontally: grip handle on the left, blade + toe to the right.
  return (
    <Svg width="204" height="74" viewBox="0 0 220 80">
      {/* blade */}
      <Rect x="60" y="22" width="152" height="36" rx="15" fill={willow} />
      {flats ? (
        <>
          {/* grain + team sticker + FLATS label on the flat face */}
          <Line x1="78" y1="31" x2="198" y2="31" stroke="#d9be89" strokeWidth="1.5" />
          <Line x1="78" y1="49" x2="198" y2="49" stroke="#d9be89" strokeWidth="1.5" />
          <Rect x="98" y="27" width="64" height="26" rx="6" fill={accent} />
          <SvgText x="130" y="45" fontSize="14" fontWeight="bold" fill="#ffffff" textAnchor="middle">FLATS</SvgText>
          <Rect x="196" y="26" width="8" height="28" rx="4" fill="#c7a86f" />
        </>
      ) : (
        <>
          {/* raised central spine + accent label ("HILLS") on the back */}
          <Rect x="62" y="34" width="146" height="12" rx="6" fill="#c3a56d" />
          <Line x1="66" y1="40" x2="92" y2="40" stroke="#efdcb2" strokeWidth="1.5" opacity="0.7" />
          <Line x1="168" y1="40" x2="204" y2="40" stroke="#efdcb2" strokeWidth="1.5" opacity="0.7" />
          <Rect x="98" y="27" width="64" height="26" rx="6" fill={accent} />
          <SvgText x="130" y="45" fontSize="14" fontWeight="bold" fill="#ffffff" textAnchor="middle">HILLS</SvgText>
        </>
      )}
      {/* handle + grip rings (same on both faces) */}
      <Rect x="6" y="34" width="60" height="12" rx="6" fill={grip} />
      <Line x1="20" y1="34" x2="20" y2="46" stroke="#4c443c" strokeWidth="2" />
      <Line x1="30" y1="34" x2="30" y2="46" stroke="#4c443c" strokeWidth="2" />
      <Line x1="40" y1="34" x2="40" y2="46" stroke="#4c443c" strokeWidth="2" />
      <Line x1="50" y1="34" x2="50" y2="46" stroke="#4c443c" strokeWidth="2" />
    </Svg>
  );
}

/* ─── BatFlip — BBL-style bat toss that decides the toss ──────────────
   The bat spins end-over-end (rotateX) with a real toss arc (up-and-down
   translate + wobble) and lands on FLATS (team 1) or HILLS (team 2). Each
   face carries its own rotateX (back offset 180°) so backfaceVisibility
   culls correctly on Android — a parent's rotation never hides a child. */
function BatFlip({ team1, team2, onResult, winner }) {
  const c = useTheme().colors;
  const K = useMemo(() => makeK(c), [c]);
  const s = useMemo(() => makeS(K), [K]);

  const drive = useRef(new Animated.Value(0)).current;
  const restDeg = useRef(0);                 // absolute resting rotation, degrees
  const tick = useRef(null);
  const pending = useRef(null);              // { target, winnerIdx } awaiting animation
  const [fromTo, setFromTo] = useState([0, 360]);
  const [flipping, setFlipping] = useState(false);

  const flip = () => {
    if (flipping) return;
    setFlipping(true);
    haptic.impact();

    const winnerIdx = Math.random() < 0.5 ? 0 : 1;   // 0 = flats (team1), 1 = hills (team2)
    // Land so final rotation mod 360 is 0 (flats) or 180 (hills), after ≥5 turns.
    let target = restDeg.current + 360 * 5;
    const want = winnerIdx === 0 ? 0 : 180;
    target += ((want - (target % 360)) + 360) % 360;

    pending.current = { target, winnerIdx };
    drive.setValue(0);
    setFromTo([restDeg.current, target]);      // triggers the effect below
  };

  // Start the spin once `fromTo` (and thus the interpolation) reflects this flip.
  useEffect(() => {
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    tick.current = setInterval(() => haptic.tick(), 120);
    Animated.timing(drive, {
      toValue: 1,
      duration: 1900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      clearInterval(tick.current);
      if (!finished) return;
      restDeg.current = job.target;
      setFlipping(false);
      haptic.success();
      onResult([team1, team2][job.winnerIdx]);
    });
    return () => clearInterval(tick.current);
  }, [fromTo]);

  useEffect(() => () => clearInterval(tick.current), []);

  const frontRotate = drive.interpolate({
    inputRange: [0, 1], outputRange: [`${fromTo[0]}deg`, `${fromTo[1]}deg`],
  });
  const backRotate = drive.interpolate({
    inputRange: [0, 1], outputRange: [`${fromTo[0] + 180}deg`, `${fromTo[1] + 180}deg`],
  });
  // Toss arc (up then down) + a little in-flight wobble, applied to the wrapper.
  const lift = drive.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -64, 0] });
  const wobble = drive.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '-9deg', '0deg'] });

  const side = winner ? (winner === team1 ? 'FLATS' : 'HILLS') : null;

  return (
    <View style={s.coinWrap}>
      <Animated.View style={[s.batStage, { transform: [{ translateY: lift }, { rotateZ: wobble }] }]}>
        <Animated.View style={[s.batFace, { transform: [{ perspective: 1000 }, { rotateX: frontRotate }] }]}>
          <BatSvg face="flats" accent={K.lime} />
        </Animated.View>
        <Animated.View style={[s.batFace, { transform: [{ perspective: 1000 }, { rotateX: backRotate }] }]}>
          <BatSvg face="hills" accent={K.blue} />
        </Animated.View>
      </Animated.View>

      <Text style={s.coinResult} numberOfLines={1}>
        {flipping ? 'Spinning the bat…' : winner ? `${winner} won · ${side}` : 'Flip the bat to decide'}
      </Text>

      <TouchableOpacity
        style={[s.flipBtn, flipping && s.flipBtnDisabled]}
        onPress={flip}
        disabled={flipping}
        activeOpacity={0.85}
      >
        <Icon name="cricket" size={18} color={flipping ? K.textMuted : K.onLime} />
        <Text style={[s.flipBtnText, flipping && { color: K.textMuted }]}>
          {flipping ? 'FLIPPING…' : winner ? 'FLIP AGAIN' : 'FLIP THE BAT'}
        </Text>
      </TouchableOpacity>
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
    // Hide the native header — the in-screen header already has a back button and
    // title, so this reclaims that whole row and keeps the screen compact.
    navigation.setOptions({ headerShown: false });
  }, [navigation]);
  const sportId = sport?.id || 'cricket';

  const [tossWinner, setTossWinner] = useState(null); // nothing pre-selected — user records the real toss
  const [decision, setDecision]     = useState('Bat');
  const [activeTeam, setActiveTeam] = useState(0); // 0 = team1, 1 = team2
  const [showFlip, setShowFlip]     = useState(false); // reveal the in-app bat flip (for users without a coin)

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
      setXI(avail.slice(0, MAX_XI).map(p => ({ id: p.id, name: p.name })));
    });
  };

  const onProceed = async () => {
    if (!tossWinner) return Alert.alert('Toss', 'Select who won the toss first.');
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
              <Text style={s.sectionTitle}>WHO WON THE TOSS?</Text>
            </View>

            {/* Primary path: tap the team that won the real-world toss */}
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

            {/* Optional: in-app bat flip for anyone without a coin */}
            {showFlip ? (
              <BatFlip team1={team1} team2={team2} winner={tossWinner} onResult={setTossWinner} />
            ) : (
              <TouchableOpacity style={s.flipToggle} onPress={() => setShowFlip(true)} activeOpacity={0.7}>
                <Icon name="cricket" size={15} color={K.textMuted} />
                <Text style={s.flipToggleText}>No coin? Flip the bat</Text>
              </TouchableOpacity>
            )}
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

            {/* Summary pill — only once a winner has been recorded */}
            {tossWinner && (
              <View style={s.summaryPill}>
                <Icon name="information-outline" size={14} color={K.lime} />
                <Text style={s.summaryText}>
                  <Text style={{ fontWeight: '800', color: K.textPrimary }}>{tossWinner}</Text>
                  {' '}won the toss — elected to{' '}
                  <Text style={{ fontWeight: '800', color: K.lime }}>{decision}</Text> first
                </Text>
              </View>
            )}
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
                        <Text style={{ color: K.textMuted }}>/{MAX_XI} selected</Text>
                      </Text>
                    </View>
                    {teamXIs[i].length >= MAX_XI && (
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
            <Text style={[s.proceedBtnText, !canProceed && s.proceedBtnTextDisabled]}>
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
    paddingTop: 48, paddingBottom: 10, paddingHorizontal: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: K.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: K.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  headerBrand: {
    fontSize: 9, fontWeight: '800', letterSpacing: 2,
    color: K.lime, marginBottom: 1,
  },
  headerTitle: {
    fontSize: 16, fontWeight: '800', letterSpacing: 0.5,
    color: K.textPrimary,
  },

  /* Body */
  body: { paddingHorizontal: Spacing.md, paddingTop: 10 },

  /* Match banner */
  matchBanner: {
    backgroundColor: K.surfaceLow,
    borderRadius: Radius.md, padding: 10,
    borderLeftWidth: 3, borderLeftColor: K.lime,
    marginBottom: 10,
  },
  matchTeams: {
    fontSize: 15, fontWeight: '800', color: K.textPrimary,
    letterSpacing: 0.3,
  },
  matchMeta: {
    fontSize: 10, color: K.textMuted, marginTop: 3,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },

  /* Sections */
  section: {
    backgroundColor: K.surfaceLow,
    borderRadius: Radius.lg, overflow: 'hidden',
    padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: K.border,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.5,
    color: K.textMuted,
  },

  /* Bat flip toss */
  coinWrap: { alignItems: 'center', gap: 12, paddingTop: 6, paddingBottom: 16 },
  batStage: {
    width: 230, height: 140, alignItems: 'center', justifyContent: 'center',
  },
  batFace: {
    position: 'absolute', top: 0, left: 0, width: 230, height: 140,
    alignItems: 'center', justifyContent: 'center',
    backfaceVisibility: 'hidden',
  },
  coinResult: {
    fontSize: 13, fontWeight: '700', color: K.textVariant, textAlign: 'center',
  },
  flipBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: K.lime, borderRadius: Radius.md,
    paddingHorizontal: 22, paddingVertical: 11, elevation: 2,
  },
  flipBtnDisabled: { backgroundColor: K.surfaceHigh, elevation: 0 },
  flipBtnText: { fontSize: 13, fontWeight: '900', letterSpacing: 1, color: K.onLime },
  flipToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingVertical: 6,
  },
  flipToggleText: {
    fontSize: 12, fontWeight: '700', color: K.textMuted, letterSpacing: 0.3,
    textDecorationLine: 'underline',
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
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
    backgroundColor: K.surfaceHigh, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 9,
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
    paddingHorizontal: Spacing.md, paddingVertical: 10,
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
    backgroundColor: K.surfaceLow, borderRadius: Radius.lg, padding: 12,
    marginBottom: 10, overflow: 'hidden', position: 'relative'
  },
  heroContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTeamName: { fontSize: 18, fontWeight: '900', color: K.textPrimary, fontStyle: 'italic', letterSpacing: 0.5 },
  heroSubtitle: { fontSize: 10, fontWeight: '800', color: K.lime, letterSpacing: 2, marginTop: 2 },
  heroStats: { alignItems: 'flex-end' },
  heroCount: { fontSize: 20, fontWeight: '900', color: K.textPrimary },
  heroCountLabel: { fontSize: 9, fontWeight: '700', color: K.blueDeep || '#3b82f6', letterSpacing: 1, marginTop: 1 },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: K.surfaceHigh,
    borderRadius: Radius.md, paddingHorizontal: 12, marginBottom: 10,
    borderWidth: 1, borderColor: K.border
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 40, color: K.textPrimary, fontSize: 14 },
  filterBtn: {
    width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: K.surfaceTop,
    borderWidth: 1, borderColor: K.border,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8
  },

  // Player rows — light + dark text so names stay readable (the old solid-blue
  // selected card washed the text out). Selected = lime-tinted with a check.
  playerCardSelected: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: K.lime + '14', borderWidth: 1.5, borderColor: K.lime,
    borderRadius: Radius.md, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 8,
  },
  playerCardUnselected: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: K.surfaceHigh, borderWidth: 1, borderColor: K.border,
    borderRadius: Radius.md, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 8,
  },
  pAvatar: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pAvatarText: { fontSize: 16, fontWeight: '900', color: K.textPrimary },
  pAvatarDim: { width: 38, height: 38, borderRadius: 10, backgroundColor: K.surfaceTop, alignItems: 'center', justifyContent: 'center' },
  pAvatarTextDim: { fontSize: 16, fontWeight: '900', color: K.textMuted },
  pInfo: { flex: 1 },
  pName: { fontSize: 14, fontWeight: '800', color: K.textPrimary },
  pNameDim: { fontSize: 14, fontWeight: '700', color: K.textVariant },
  pRole: { fontSize: 10, fontWeight: '600', color: K.textMuted, marginTop: 1, letterSpacing: 0.5 },
  pCheck: { width: 26, height: 26, borderRadius: 13, backgroundColor: K.lime, alignItems: 'center', justifyContent: 'center' },
  pAdd: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: K.textMuted, alignItems: 'center', justifyContent: 'center' },

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
  // Solid muted surface (not a whole-button opacity fade, which washed the
  // label out to near-unreadable) so the "SELECT XI (n+n)" hint stays legible.
  proceedBtnDisabled: { backgroundColor: K.surfaceHigh, elevation: 0, borderWidth: 1, borderColor: K.border },
  proceedBtnText: {
    fontSize: 14, fontWeight: '900', color: K.bg,
    letterSpacing: 0.5,
  },
  proceedBtnTextDisabled: { color: K.textPrimary },
});
