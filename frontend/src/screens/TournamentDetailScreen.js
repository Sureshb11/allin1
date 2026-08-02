import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, Alert, TextInput, Image, Linking
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import HexAvatar from '../components/HexAvatar';
import { showToast } from '../components/Toast';
import legendsApi from '../services/LegendsApi';
import { getSport } from '../sports';
import { joinPolicy } from '../utils/tournamentPolicy';
import FocusedImage from '../components/FocusedImage';

import { useFocusEffect } from '@react-navigation/native';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { useHideTabBarOnScroll } from '../components/AutoHideTabBar';

const TABS = ['Overview', 'Points Table', 'Schedule', 'Leaders'];

// Create Tournament asks for ten sections' worth of detail. This screen showed
// six info cards, the description and the organiser's name — so a logo, a cover
// image, the ground, the registration window, the entry fee, the squad limits,
// the match rules, the points system, the prize breakdown and every way of
// contacting the organiser were all collected, stored, and never shown again.
//
// Everything below renders only when it has something to say, so a tournament
// created with just the twelve required fields looks the same as it did rather
// than sprouting a screenful of dashes.

const RULE_LABELS = {
  wide: 'Wides', noBall: 'No balls', freeHit: 'Free hit', legBye: 'Leg byes', bye: 'Byes',
  dls: 'DLS', superOver: 'Super over', powerplay: 'Powerplay', penaltyRuns: 'Penalty runs',
};
const TIEBREAK_LABELS = {
  points: 'Points', nrr: 'Net Run Rate', h2h: 'Head-to-head', wins: 'Wins', boundaries: 'Boundary count',
};
const REG_TYPE_LABELS = { open: 'Open to any team', invite: 'Invite only', approval: 'Approval required' };
const CURRENCY_SIGN = { INR: '₹', USD: '$', GBP: '£', AUD: '$', AED: 'د.إ', LKR: 'Rs', PKR: 'Rs', BDT: '৳', NZD: '$', ZAR: 'R' };

const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const joinWith = (...parts) => parts.filter(Boolean).join(', ');

// A titled block of label/value rows that disappears when every row is empty.
function DetailSection({ title, icon, rows, children }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const shown = (rows || []).filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== '—');
  if (!shown.length && !children) return null;
  return (
    <View style={styles.section}>
      <View style={styles.detailHead}>
        <Icon name={icon} size={15} color={DS.lime} />
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{title}</Text>
      </View>
      {shown.map(([k, v]) => (
        <View key={k} style={styles.detailRow}>
          <Text style={styles.detailKey}>{k}</Text>
          <Text style={styles.detailVal} numberOfLines={2}>{String(v)}</Text>
        </View>
      ))}
      {children}
    </View>
  );
}

// Series honours, iconed the same as the post-match awards popup — the same
// award should look the same wherever it's won.
// How many registered teams the Overview shows before it needs a tap.
const TEAMS_COLLAPSED = 5;

const SERIES_AWARD_ICON = { batter: 'cricket', bowler: 'bowling', fielder: 'hand-back-right' };

// Single-accent: all avatars are the deep green (white initials read on both themes).
const avatarColor = () => '#0a5227';
const captainOf = (team) => team?.captain?.name || team?.captainName || (team?.players && team.players[0]?.name) || 'TBD';
const initials2 = (name) => {
  const w = (name || '').trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return 'T';
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[w.length - 1][0]).toUpperCase();
};

const makeStatusColors = (DS) => ({
  upcoming: { bg: DS.lime + '22', text: DS.lime },
  ongoing: { bg: DS.lime + '22', text: DS.lime },
  completed: { bg: DS.surfaceHigh, text: DS.textMuted },
});

export default function TournamentDetailScreen({ route, navigation }) {
  const DS = useTheme().colors;
  const hideTabBar = useHideTabBarOnScroll();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);
  const styles = useThemedStyles(makeStyles);
  const STATUS_COLORS = makeStatusColors(DS);
  const { tournamentId } = route.params || {};
  const [tournament, setTournament] = useState(null);
  const [pointsTable, setPointsTable] = useState([]);
  // One table per stage when the API offers them (see lib/standings.js). The
  // flat pointsTable stays for a single-group tournament and for an API that
  // predates stages.
  const [stages, setStages] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [showAllTeams, setShowAllTeams] = useState(false);
  const [activeTab, setActiveTab] = useState(TABS.includes(route.params?.initialTab) ? route.params.initialTab : 'Overview');
  const [loading, setLoading] = useState(true);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState('add'); // 'add' (organiser) | 'join' (participant request)
  const [selectedTeamIds, setSelectedTeamIds] = useState(new Set());
  const [myTeams, setMyTeams] = useState([]);
  const [myUserId, setMyUserId] = useState(null);      // to decide organiser vs participant
  const [joinRequests, setJoinRequests] = useState([]); // pending requests (organiser view)
  const [myRequests, setMyRequests] = useState([]);     // the caller's own requests (requester view)
  const [requestNote, setRequestNote] = useState('');   // one-line pitch sent with a join request
  const [processing, setProcessing] = useState(false);
  const [showAutoScheduleModal, setShowAutoScheduleModal] = useState(false);
  const [scheduleFormat, setScheduleFormat] = useState('classic_t20');
  const [autoSplit, setAutoSplit] = useState(true);
  const [manualGroups, setManualGroups] = useState({});
  // Record-result modal state
  const [leaderboard, setLeaderboard] = useState(null); // { batsmen, bowlers, awards }
  const [scheduleView, setScheduleView] = useState(route.params?.bracket ? 'bracket' : 'fixtures'); // Schedule tab sub-view
  const [resultFixture, setResultFixture] = useState(null); // fixture being scored
  const [abandoned, setAbandoned] = useState(false);        // washout: no result, no NRR
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [oversA, setOversA] = useState('');
  const [oversB, setOversB] = useState('');

  useEffect(() => {
    if (showAutoScheduleModal && tournament?.teams) {
      const initialGroups = {};
      tournament.teams.forEach(t => {
        if (t.group) initialGroups[t.team.id] = t.group;
      });
      setManualGroups(initialGroups);
    }
  }, [showAutoScheduleModal, tournament]);

  useEffect(() => {
    const load = async () => {
      const [tRes, stRes, ptRes, schRes, meRes] = await Promise.all([
        legendsApi.getTournament(tournamentId),
        legendsApi.getTournamentStandings(tournamentId),   // Module 2 computed table
        legendsApi.getTournamentPointsTable(tournamentId), // fallback (older API)
        legendsApi.getTournamentSchedule(tournamentId),
        legendsApi.getMe(),                                // to tell organiser from participant
      ]);
      if (tRes.success) setTournament(tRes.data);
      // Prefer the computed standings; fall back to the legacy points table.
      if (stRes.success && stRes.data.length) setPointsTable(stRes.data);
      else if (ptRes.success) setPointsTable(ptRes.data);
      if (stRes.success) setStages(stRes.stages || []);
      if (schRes.success) setSchedule(schRes.data);

      const myId = meRes.success ? meRes.data?.user?.id : null;
      setMyUserId(myId);

      // Sport isolation: only offer same-sport teams for this tournament.
      const myTeamsRes = await legendsApi.getTeams(tRes.success ? tRes.data.sport : undefined);
      if (myTeamsRes.success) setMyTeams(myTeamsRes.data);

      // Organiser (creator, or any legacy tournament with no recorded organiser)
      // sees the pending join requests to approve/reject.
      const t = tRes.success ? tRes.data : null;
      if (t && (!t.organizerId || t.organizerId === myId)) {
        const jr = await legendsApi.getTournamentJoinRequests(tournamentId);
        if (jr.success) setJoinRequests(jr.data);
      } else {
        // Participant side: their own pending requests, so they can see the
        // status and reach the chat they're half of.
        const mine = await legendsApi.getMyJoinRequests(tournamentId);
        if (mine.success) setMyRequests(mine.data);
      }

      setLoading(false);

      // Arrived from the list's JOIN button: open the picker straight away
      // rather than landing on Overview and making them find it again. Not for
      // the organiser — they can't request to join their own tournament — and
      // not once it's over.
      const isOrg = t && (!t.organizerId || t.organizerId === myId);
      if (route.params?.join && !isOrg && joinPolicy(t, (t?.teams || []).length).open) {
        setPickerMode('join');
        setShowTeamPicker(true);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  // Coming back from an edit, the header and every section have to show what
  // was just saved. Mount already loaded, so the first focus is skipped rather
  // than fetching the same thing twice.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    legendsApi.getTournament(tournamentId).then((r) => { if (r.success) setTournament(r.data); });
  }, [tournamentId]));

  // The wizard already asked what shape this tournament is. The schedule sheet
  // asked again, under different names, and defaulted to Classic T20 — so a
  // tournament created as Knockout offered to generate a league. The category
  // picks the default; the organiser can still change it, since these four are
  // finer-grained than the six the wizard offers.
  const CATEGORY_TO_FORMAT = {
    'Knockout': 'knockout',
    'Double Elimination': 'knockout',
    'League': 'classic_t20',
    'Round Robin': 'classic_t20',
    'League + Knockout': 'classic_t20',
  };
  useEffect(() => {
    const suggested = CATEGORY_TO_FORMAT[tournament?.category];
    if (suggested) setScheduleFormat(suggested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.category]);

  // Lazily load the leaderboard the first time the Leaders tab is opened.
  useEffect(() => {
    if (activeTab === 'Leaders' && !leaderboard) {
      legendsApi.getTournamentLeaderboard(tournamentId).then(r =>
        setLeaderboard(r.success ? r.data : { batsmen: [], bowlers: [], awards: [] }));
    }
  }, [activeTab, leaderboard, tournamentId]);

  const toggleTeamSelection = (id) => {
    const next = new Set(selectedTeamIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      const currentCount = (tournament?.teams || []).length;
      if (tournament?.maxTeams && currentCount + next.size >= tournament.maxTeams) {
        alert(`Tournament is limited to ${tournament.maxTeams} teams.`);
        return;
      }
      next.add(id);
    }
    setSelectedTeamIds(next);
  };

  const handleRegisterSelectedTeams = async () => {
    if (selectedTeamIds.size === 0) return;
    setProcessing(true);

    // Filter out teams already in the tournament
    const existingIds = new Set((tournament?.teams || []).map(t => t.team.id));
    const toSubmit = [...selectedTeamIds].filter(id => !existingIds.has(id));

    let successCount = 0;
    let lastError = '';
    for (const teamId of toSubmit) {
      // Organiser adds directly (approved); a participant sends a join request (pending).
      const res = pickerMode === 'join'
        ? await legendsApi.requestToJoinTournament(tournamentId, teamId, 'A', requestNote)
        : await legendsApi.registerTeamInTournament(tournamentId, teamId);
      if (res.success) successCount++; else lastError = res.error || lastError;
    }

    // Organiser-added teams show up in the approved list immediately; requests don't.
    if (successCount > 0 && pickerMode === 'add') {
      const tRes = await legendsApi.getTournament(tournamentId);
      if (tRes.success) setTournament(tRes.data);
    }

    setShowTeamPicker(false);
    setSelectedTeamIds(new Set());
    setProcessing(false);
    if (pickerMode === 'join' && successCount > 0) {
      alert(`Request sent to the organiser for ${successCount} team${successCount !== 1 ? 's' : ''}. You'll be notified when it's approved.`);
    } else if (successCount === 0 && lastError) {
      alert(lastError);
    }
  };

  const reloadRequests = async () => {
    const jr = await legendsApi.getTournamentJoinRequests(tournamentId);
    if (jr.success) setJoinRequests(jr.data);
  };

  const handleApproveRequest = async (teamId) => {
    setProcessing(true);
    const res = await legendsApi.approveJoinRequest(tournamentId, teamId);
    if (res.success) {
      await reloadRequests();
      const tRes = await legendsApi.getTournament(tournamentId);
      if (tRes.success) setTournament(tRes.data);
    } else {
      alert(res.error || 'Failed to approve');
    }
    setProcessing(false);
  };

  const handleRejectRequest = async (teamId) => {
    setProcessing(true);
    const res = await legendsApi.rejectJoinRequest(tournamentId, teamId);
    if (res.success) await reloadRequests();
    else alert(res.error || 'Failed to reject');
    setProcessing(false);
  };

  // Open the requester↔organiser conversation. The room is created server-side
  // on first use, so this works the same whether or not they've talked before.
  const openRequestChat = async (teamId, teamName) => {
    setProcessing(true);
    const res = await legendsApi.openJoinRequestChat(tournamentId, teamId);
    setProcessing(false);
    if (res.success && res.data?.chatRoomId) {
      navigation.navigate('Chat', { chatId: res.data.chatRoomId, chatName: res.data.name || teamName || 'Chat' });
    } else {
      showToast(res.error || 'Could not open the chat', 'error');
    }
  };

  // Has this team played anything that counts? Removing one that has is what
  // the server now refuses (409): the fixture rows survive the delete, so their
  // opponents keep the points while the team vanishes from the table. The check
  // is repeated here only so the trash icon can disappear before it is tapped —
  // the server is the one that decides.
  const hasPlayed = (teamId) =>
    schedule.some((m) => m.status === 'completed' && (m.team1?.id === teamId || m.team2?.id === teamId));

  const handleRemoveTeam = (teamId, teamName) => {
    // Was a bare one-tap delete. A mis-tap on a 20pt icon dropped a team out of
    // a live tournament with no way back.
    Alert.alert(
      'Remove team?',
      `${teamName || 'This team'} will be taken out of the tournament. They can be added again, but any groups or fixtures they're in will need redoing.`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => doRemoveTeam(teamId) },
      ],
    );
  };

  const doRemoveTeam = async (teamId) => {
    setProcessing(true);
    const res = await legendsApi.removeTeamFromTournament(tournamentId, teamId);
    if (res.success) {
      const tRes = await legendsApi.getTournament(tournamentId);
      if (tRes.success) setTournament(tRes.data);
    } else {
      showToast(res.error || 'Failed to remove team', 'error');
    }
    setProcessing(false);
  };

  const handleAutoSchedule = async () => {
    setProcessing(true);
    
    // Save manual groups if autoSplit is false
    if (!autoSplit) {
      const assignments = Object.keys(manualGroups).map(teamId => {
        const tTeam = tournament.teams.find(t => t.team.id === teamId);
        return { id: tTeam.id, group: manualGroups[teamId] };
      });
      await legendsApi.assignTournamentGroups(tournamentId, assignments);
    }
    
    const res = await legendsApi.autoScheduleTournament(tournamentId, { format: scheduleFormat, autoSplit });
    if (res.success) {
      const schRes = await legendsApi.getTournamentSchedule(tournamentId);
      if (schRes.success) setSchedule(schRes.data);
      const tRes = await legendsApi.getTournament(tournamentId);
      if (tRes.success) setTournament(tRes.data); // Reload teams for group badges
      setShowAutoScheduleModal(false);
      showToast(`Generated ${res.data?.count ?? ''} fixtures`, 'success');
    } else {
      showToast(res.error || 'Failed to generate schedule', 'error');
    }
    setProcessing(false);
  };

  // Re-fetch schedule + standings + teams (after a result, the bracket may have
  // advanced and the points table changed).
  const reloadData = async () => {
    const [schRes, stRes, tRes] = await Promise.all([
      legendsApi.getTournamentSchedule(tournamentId),
      legendsApi.getTournamentStandings(tournamentId),
      legendsApi.getTournament(tournamentId),
    ]);
    if (schRes.success) setSchedule(schRes.data);
    if (stRes.success && stRes.data.length) setPointsTable(stRes.data);
    if (tRes.success) setTournament(tRes.data);
    setLeaderboard(null); // stale after a result → re-fetch when Leaders tab reopens
  };

  const openResult = (fixture) => {
    setResultFixture(fixture);
    // Re-opening a fixture already filed as a washout should show it as one,
    // not as a blank scoreline.
    setAbandoned(fixture.resultKind === 'noResult');
    const defOvers = tournament?.overs ? String(tournament.overs) : '';
    const s1 = fixture.resultStats?.[fixture.team1?.id];
    const s2 = fixture.resultStats?.[fixture.team2?.id];
    setScoreA(s1?.scored != null ? String(s1.scored) : '');
    setScoreB(s2?.scored != null ? String(s2.scored) : '');
    setOversA(s1?.oversFaced != null ? String(s1.oversFaced) : defOvers);
    setOversB(s2?.oversFaced != null ? String(s2.oversFaced) : defOvers);
  };

  const submitResult = async () => {
    const f = resultFixture;
    if (!f?.team1?.id || !f?.team2?.id) return;

    let resultKind = 'noResult', winnerTeamId = null, stats = {};
    if (!abandoned) {
      const a = parseInt(scoreA, 10), b = parseInt(scoreB, 10);
      if (Number.isNaN(a) || Number.isNaN(b)) return showToast('Enter both scores', 'error');
      const ovA = parseFloat(oversA) || 0, ovB = parseFloat(oversB) || 0;
      resultKind = a === b ? 'tie' : 'win';
      winnerTeamId = a === b ? null : (a > b ? f.team1.id : f.team2.id);
      // An abandoned match sends no stats at all: the standings engine only
      // reads what's here, so an empty payload is what keeps a washout out of
      // Net Run Rate.
      stats = {
        [f.team1.id]: { scored: a, conceded: b, oversFaced: ovA, oversBowled: ovB },
        [f.team2.id]: { scored: b, conceded: a, oversFaced: ovB, oversBowled: ovA },
      };
    }
    setProcessing(true);
    const res = await legendsApi.reportTournamentResult(tournamentId, { tmId: f.id, winnerTeamId, resultKind, stats });
    if (res.success) {
      setResultFixture(null);
      setAbandoned(false);
      await reloadData();
      showToast(res.data?.resolved > 0
        ? 'Result saved — next-round fixtures updated'
        : 'Result saved', 'success');
    } else {
      showToast(res.error || 'Failed to save result', 'error');
    }
    setProcessing(false);
  };

  // Start a real ball-by-ball match for this fixture: create the match (seeded
  // from the tournament + sport-safe), link it to the fixture, then jump into the
  // scoring flow. When that match completes, the fixture auto-finalizes.
  const startFixtureMatch = async (fixture) => {
    if (!fixture?.team1?.id || !fixture?.team2?.id) return;
    setProcessing(true);
    const sportId = tournament.sport || 'cricket';
    const overs = tournament.overs || 20;
    const venue = tournament.venue || fixture.venue || '';
    const res = await legendsApi.createMatch({
      team1Id: fixture.team1.id,
      team2Id: fixture.team2.id,
      overs,
      venue,
      matchType: tournament.format || 'T20',
      ...(sportId === 'cricket' ? { ballType: tournament.ballType || 'Leather' } : {}),
      status: 'scheduled',
      sport: sportId,
    });
    if (!res.success) { setProcessing(false); alert(res.error || 'Could not start match'); return; }
    const matchId = res.data.id;
    await legendsApi.linkTournamentFixtureMatch(tournamentId, fixture.id, matchId);
    await reloadData();
    setProcessing(false);

    const inningsRes = await legendsApi.getMatchInnings(matchId);
    const firstInning = inningsRes.success && inningsRes.data.length > 0 ? inningsRes.data[0] : null;
    // TournamentDetail, TossLineup and Scoring share one stack → navigate directly.
    navigation.navigate('TossLineup', {
      team1: fixture.team1.name, team2: fixture.team2.name,
      overs: String(overs), venue, matchType: tournament.format || 'T20',
      ballType: tournament.ballType || 'Leather',
      matchId, team1Id: fixture.team1.id, team2Id: fixture.team2.id,
      firstInningId: firstInning?.id, sport: getSport(sportId),
    });
  };

  const resumeFixtureMatch = (fixture) => {
    if (!fixture?.matchId) return;
    navigation.navigate('Scoring', { resume: true, matchId: fixture.matchId });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>
    );
  }

  if (!tournament) {
    return (
      <View style={styles.centered}>
        <Icon name="alert-circle-outline" size={48} color={DS.coral} />
        <Text style={styles.errorText}>Tournament not found</Text>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[tournament.status] || STATUS_COLORS.upcoming;

  // Only the creator manages the tournament. Legacy tournaments with no recorded
  // organiser stay open (matches the backend's fallback) so old data isn't locked out.
  const isOrganizer = !tournament.organizerId || (!!myUserId && tournament.organizerId === myUserId);
  // Teams this user can enter: ones they own, OR ones they play for. This used
  // to be owner-only, which contradicted the app's own "My Teams" (owned OR
  // played for) — a player saw their team listed as theirs on one screen and was
  // told they owned none on this one. The organiser approves either way.
  const myEntryTeams = myTeams.filter(t =>
    (t.ownerId && t.ownerId === myUserId) ||
    (t.players || []).some(p => p.userId && p.userId === myUserId)
  );

  // The config blocks, each defaulted so a tournament created before these
  // columns existed reads as "nothing to show" rather than throwing.
  const loc     = tournament.location || {};
  const reg     = tournament.regWindow || {};
  const entry   = tournament.registration || {};
  const rules   = tournament.rules || {};
  const pts     = tournament.pointsRules || {};
  const prizes  = tournament.prizes || {};
  const contact = tournament.contact || {};
  const sign    = CURRENCY_SIGN[entry.currency] || '';
  const enabledRules = Object.keys(RULE_LABELS).filter((k) => rules[k]);
  // Whether a team can ask to join, and why not when it can't.
  const policy = joinPolicy(tournament, (tournament.teams || []).length);
  // Anything drawn over the cover photo needs the light treatment; without a
  // cover the header is an ordinary surface and keeps the theme's colours.
  const onCover = !!tournament.banner;

  // "15–16 Aug 2026" rather than two cards. Same month and year collapse; a
  // range spanning either keeps what it needs to stay unambiguous.
  const dateRange = (() => {
    const a = tournament.startDate ? new Date(tournament.startDate) : null;
    const b = tournament.endDate ? new Date(tournament.endDate) : null;
    if (!a && !b) return null;
    const d = (x, opts) => x.toLocaleDateString('en-IN', opts);
    if (!b) return d(a, { day: 'numeric', month: 'short', year: 'numeric' });
    if (!a) return d(b, { day: 'numeric', month: 'short', year: 'numeric' });
    const sameYear = a.getFullYear() === b.getFullYear();
    const sameMonth = sameYear && a.getMonth() === b.getMonth();
    if (a.getTime() === b.getTime()) return d(a, { day: 'numeric', month: 'short', year: 'numeric' });
    if (sameMonth) return `${a.getDate()}–${d(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    if (sameYear) return `${d(a, { day: 'numeric', month: 'short' })} – ${d(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    return `${d(a, { day: 'numeric', month: 'short', year: 'numeric' })} – ${d(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  })();

  const renderOverview = () => (
    <ScrollView {...hideTabBar} contentContainerStyle={styles.tabContent}>
      {/* Info Grid */}
      {/* Five cards, not eight. Type moved to a header chip and Venue has its
          own section below, so both were being said twice; Start and End were
          two cards describing one range. What's left is what nothing else on
          the screen tells you. */}
      <View style={styles.infoGrid}>
        {[
          { icon: 'trophy-outline', label: 'Format',
            value: tournament.overs ? `${tournament.format} · ${tournament.overs} ov` : tournament.format },
          { icon: 'account-group-outline', label: 'Teams',
            value: `${(tournament.teams || []).length} / ${tournament.maxTeams || '—'}` },
          { icon: 'calendar-range', label: 'Dates', value: dateRange },
          { icon: 'currency-inr', label: 'Prize Pool',
            value: tournament.prizePool ? `${sign}${tournament.prizePool}` : null },
          { icon: 'cricket', label: 'Ball', value: tournament.ballType },
        ].filter((c) => c.value).map(({ icon, label, value }) => (
          <View key={label} style={styles.infoCard}>
            <Icon name={icon} size={20} color={DS.blue} />
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
          </View>
        ))}
      </View>

      {!!tournament.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.descText}>{tournament.description}</Text>
        </View>
      )}

      <DetailSection title="Where" icon="map-marker-outline" rows={[
        ['Ground', loc.ground],
        ['Venue', tournament.venue],
        ['City', joinWith(tournament.city, loc.state, loc.country)],
      ]} />

      <DetailSection title="Registration" icon="clipboard-text-clock-outline" rows={[
        ['Opens', fmtDay(reg.opensAt)],
        ['Closes', fmtDay(reg.closesAt)],
        ['First ball', joinWith(reg.startTime, reg.timeZone)],
        ['Entry fee', entry.entryFee === 0 ? 'Free'
          : entry.entryFee != null ? `${sign}${entry.entryFee}` : ''],
        ['Teams', entry.minTeams ? `${entry.minTeams}–${tournament.maxTeams || '?'}` : ''],
        ['Squad', entry.minPlayers ? `${entry.minPlayers}–${entry.maxPlayers}` : ''],
        ['Playing XI', entry.playingXi ? `${entry.playingXi}${entry.substitutes ? ` + ${entry.substitutes} subs` : ''}` : ''],
        ['Joining', REG_TYPE_LABELS[entry.type]],
      ]} />

      {/* Rules read as chips rather than a list of "yes" — what's ON is the
          information; nine rows each saying Enabled is not. */}
      {enabledRules.length > 0 && (
        <DetailSection title="Match rules" icon="gavel" rows={[
          ['Powerplay', rules.powerplay && rules.powerplayOvers ? `${rules.powerplayOvers} overs` : ''],
          ['Bowler quota', rules.maxOversPerBowler ? `${rules.maxOversPerBowler} overs` : ''],
        ]}>
          <View style={styles.chipWrap}>
            {enabledRules.map((k) => (
              <View key={k} style={styles.ruleChip}>
                <Icon name="check" size={11} color={DS.lime} />
                <Text style={styles.ruleChipText}>{RULE_LABELS[k]}</Text>
              </View>
            ))}
          </View>
        </DetailSection>
      )}

      <DetailSection title="Points system" icon="format-list-numbered" rows={[
        ['Win', pts.win], ['Tie', pts.tie], ['No result', pts.noResult], ['Loss', pts.loss],
        ['Bonus point', pts.bonus ? 'Yes' : ''],
        ['Tie-breaks', (pts.tieBreak || []).map((t) => TIEBREAK_LABELS[t] || t).join(' → ')],
      ]} />

      <DetailSection title="Prizes" icon="medal-outline" rows={[
        ['Winner', prizes.winner ? `${sign}${prizes.winner}` : ''],
        ['Runner-up', prizes.runnerUp ? `${sign}${prizes.runnerUp}` : ''],
        ['Semi-finalist', prizes.semiFinal ? `${sign}${prizes.semiFinal}` : ''],
      ]} />

      {!!tournament.organizer && (
        <View style={styles.section}>
          <View style={styles.detailHead}>
            <Icon name="account-tie" size={15} color={DS.lime} />
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Organizer</Text>
          </View>
          <Text style={styles.organizerText}>{tournament.organizer}</Text>
          {/* Contact details are served to signed-in callers only (the API
              nulls them otherwise), and each one is the action it describes. */}
          <View style={styles.chipWrap}>
            {[
              contact.phone && { icon: 'phone', label: 'Call', url: `tel:${contact.phone}` },
              contact.whatsapp && { icon: 'whatsapp', label: 'WhatsApp', url: `https://wa.me/${contact.whatsapp}` },
              contact.email && !/@otp\.local$/.test(contact.email) && { icon: 'email-outline', label: 'Email', url: `mailto:${contact.email}` },
              contact.website && { icon: 'web', label: 'Website', url: /^https?:/.test(contact.website) ? contact.website : `https://${contact.website}` },
            ].filter(Boolean).map((c) => (
              <TouchableOpacity key={c.label} style={styles.contactChip} activeOpacity={0.85}
                onPress={() => Linking.openURL(c.url).catch(() => showToast('Nothing on this device can open that', 'error'))}>
                <Icon name={c.icon} size={13} color={DS.lime} />
                <Text style={styles.contactChipText}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Registered Teams */}
      {((tournament.teams || []).length > 0 || ['upcoming', 'ongoing'].includes(tournament.status)) && (
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Registered Teams</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{(tournament.teams || []).length}</Text>
              </View>
            </View>
            {['upcoming', 'ongoing'].includes(tournament.status) && (
              isOrganizer ? (
                <TouchableOpacity style={styles.addBtn} onPress={() => { setPickerMode('add'); setShowTeamPicker(true); }}>
                  <Text style={styles.addBtnText}>+ Add Team</Text>
                </TouchableOpacity>
              ) : policy.open ? (
                <TouchableOpacity style={styles.addBtn} onPress={() => { setPickerMode('join'); setShowTeamPicker(true); }}>
                  <Text style={styles.addBtnText}>Request to Join</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.policyNote}>{policy.reason}</Text>
              )
            )}
          </View>
          {/* The count badge above says 16 while this listed 5 — the slice had no
              "show the rest" anywhere, so eleven teams simply weren't in the UI.
              Still collapsed by default (a 20-team overview is a wall), but now
              it says how many it's holding back and opens. */}
          {(showAllTeams ? (tournament.teams || []) : (tournament.teams || []).slice(0, TEAMS_COLLAPSED)).map(({ team, group }) => (
            <View key={team.id} style={styles.teamRow}>
              <HexAvatar size={38} color={avatarColor(team.name)}>
                <Text style={styles.teamAvatarText}>{team.name?.charAt(0).toUpperCase()}</Text>
              </HexAvatar>
              <View style={{ flex: 1 }}>
                <Text style={styles.teamName}>{team.name}</Text>
                <Text style={styles.teamCaptain}>Captain: {captainOf(team)}</Text>
              </View>
              <View style={styles.groupBadge}>
                <Text style={styles.groupText}>Grp {group}</Text>
              </View>
              {isOrganizer && ['upcoming', 'ongoing'].includes(tournament.status) && !hasPlayed(team.id) && (
                <TouchableOpacity onPress={() => handleRemoveTeam(team.id, team.name)} disabled={processing} style={{ marginLeft: 12 }}>
                  <Icon name="trash-can-outline" size={20} color={DS.coral} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {(tournament.teams || []).length > TEAMS_COLLAPSED && (
            <TouchableOpacity
              onPress={() => setShowAllTeams((v) => !v)}
              style={styles.showAllRow}
              activeOpacity={0.7}>
              <Text style={styles.viewAllText}>
                {showAllTeams
                  ? 'Show fewer'
                  : `Show all ${(tournament.teams || []).length} teams`}
              </Text>
              <Icon name={showAllTeams ? 'chevron-up' : 'chevron-down'} size={18} color={DS.lime} />
            </TouchableOpacity>
          )}
          {(tournament.teams || []).length > 0 && ['upcoming', 'ongoing'].includes(tournament.status) && (isOrganizer || policy.open) && (
            <TouchableOpacity onPress={() => { setPickerMode(isOrganizer ? 'add' : 'join'); setShowTeamPicker(true); }} style={{ paddingTop: 14, alignItems: 'center' }}>
              <Text style={styles.viewAllText}>{isOrganizer ? 'Add More Teams' : 'Request to Join'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Pending Join Requests — organiser only */}
      {isOrganizer && joinRequests.length > 0 && (
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Pending Requests</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{joinRequests.length}</Text>
            </View>
          </View>
          {joinRequests.map(({ team, requester, squadSize, record, unread, requestNote: note }) => (
            <View key={team.id} style={styles.requestCard}>
              <View style={styles.teamRow}>
                <HexAvatar size={38} color={avatarColor(team.name)}>
                  <Text style={styles.teamAvatarText}>{team.name?.charAt(0).toUpperCase()}</Text>
                </HexAvatar>
                <View style={{ flex: 1 }}>
                  <Text style={styles.teamName}>{team.name}</Text>
                  {/* Who you're actually approving. Older requests predate the
                      requester being recorded, so fall back to the captain. */}
                  <Text style={styles.teamCaptain} numberOfLines={1}>
                    {requester?.name
                      ? `Requested by ${requester.name}`
                      : `Captain: ${captainOf(team)}`}
                    {squadSize ? ` · ${squadSize} players` : ''}
                  </Text>
                  {/* Their record, so you can judge without having to ask. */}
                  {record?.matches > 0 && (
                    <Text style={styles.teamRecord}>
                      {record.wins}W–{record.losses}L in {record.matches} · {Math.round((record.wins / record.matches) * 100)}% win
                    </Text>
                  )}
                </View>
              </View>
              {!!note && <Text style={styles.requestNote} numberOfLines={3}>“{note}”</Text>}
              <View style={styles.requestActions}>
                {/* Ask before you decide — the whole point of the chat. */}
                <TouchableOpacity onPress={() => openRequestChat(team.id, team.name)}
                                  disabled={processing || !requester}
                                  style={[styles.msgBtn, !requester && { opacity: 0.4 }]}>
                  <Icon name="message-text-outline" size={15} color={DS.textPrimary} />
                  <Text style={styles.msgBtnText}>Message</Text>
                  {unread > 0 && (
                    <View style={styles.unreadDot}>
                      <Text style={styles.unreadDotText}>{unread > 9 ? '9+' : unread}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => handleRejectRequest(team.id)} disabled={processing} style={styles.rejectBtn}>
                  <Text style={styles.rejectBtnText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleApproveRequest(team.id)} disabled={processing} style={styles.approveBtn}>
                  <Icon name="check" size={16} color={DS.bg} />
                  <Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Your pending request — participant side. Mirrors the organiser's card
          so both halves of the conversation can reach the same room. */}
      {!isOrganizer && myRequests.filter(r => r.status === 'pending').length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Request</Text>
          {myRequests.filter(r => r.status === 'pending').map((r) => (
            <View key={r.id} style={styles.requestCard}>
              <View style={styles.teamRow}>
                <HexAvatar size={38} color={avatarColor(r.team?.name || '')}>
                  <Text style={styles.teamAvatarText}>{r.team?.name?.charAt(0).toUpperCase()}</Text>
                </HexAvatar>
                <View style={{ flex: 1 }}>
                  <Text style={styles.teamName}>{r.team?.name}</Text>
                  <Text style={styles.teamCaptain}>Waiting for the organiser to approve</Text>
                </View>
                <View style={styles.pendingPill}>
                  <Text style={styles.pendingPillText}>PENDING</Text>
                </View>
              </View>
              <View style={styles.requestActions}>
                <TouchableOpacity onPress={() => openRequestChat(r.team?.id, r.team?.name)}
                                  disabled={processing} style={styles.msgBtn}>
                  <Icon name="message-text-outline" size={15} color={DS.textPrimary} />
                  <Text style={styles.msgBtnText}>Message organiser</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Tournament Media */}
      <View style={styles.mediaCard}>
        <View style={styles.mediaThumb}>
          <Icon name="image-multiple" size={26} color={DS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.mediaTitle}>Tournament Media</Text>
          <Text style={styles.mediaSub}>Access photos, videos and highlights from previous years.</Text>
          <View style={styles.mediaLinkRow}>
            <Text style={styles.mediaLink}>Open Gallery</Text>
            <Icon name="chevron-right" size={16} color={DS.blue} />
          </View>
        </View>
      </View>

      {/* Rules & Regulations */}
      <View style={styles.mediaCard}>
        <View style={[styles.mediaThumb, { backgroundColor: DS.blueDeep }]}>
          <Icon name="file-document-outline" size={26} color={DS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.mediaTitle}>Rules &amp; Regulations</Text>
          <Text style={styles.mediaSub}>Read the official {tournament.format || 'T20'} rulebook for this tournament.</Text>
          <View style={styles.mediaLinkRow}>
            <Text style={styles.mediaLink}>Download PDF</Text>
            <Icon name="download" size={15} color={DS.blue} />
          </View>
        </View>
      </View>
    </ScrollView>
  );

  // Tiebreaker column is sport-aware: cricket shows Net Run Rate, goal sports
  // show Goal Difference, everything else a generic Difference.
  const GOAL_SPORTS = ['football', 'hockey', 'handball'];
  const tbKey = tournament?.sport === 'cricket' ? 'NRR'
              : GOAL_SPORTS.includes(tournament?.sport) ? 'GD' : 'DIFF';
  const tbValue = (row) => {
    // computed-standings row has `stats`; legacy row has flat `nrr`.
    const s = row.stats;
    if (tbKey === 'NRR') { const v = s ? s.nrr : row.nrr; return `${v >= 0 ? '+' : ''}${(v || 0).toFixed(3)}`; }
    const v = s ? s.goalDifference : 0;
    return `${v > 0 ? '+' : ''}${v || 0}`;
  };
  const tbPositive = (row) => (row.stats ? (tbKey === 'NRR' ? row.stats.nrr : row.stats.goalDifference) : row.nrr) >= 0;

  // Recent form (last 5, newest first) from completed group/league fixtures.
  const formFor = (teamId) => {
    const played = schedule
      .filter(m => m.status === 'completed' && (m.team1?.id === teamId || m.team2?.id === teamId))
      .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt))
      .slice(0, 5);
    return played.map(m => {
      // A no-result has no winner, so "did this team win?" answered L and every
      // washed-out match showed in the form guide as a defeat.
      if (m.resultKind === 'noResult') return 'N';
      if (m.resultKind === 'tie' || m.resultKind === 'draw') return 'T';
      return m.winnerTeamId === teamId ? 'W' : 'L';
    });
  };
  const FORM_C = { W: DS.success, L: DS.coral, T: DS.textMuted, N: DS.textMuted };

  const renderPointsTable = () => {
    // Prefer the per-stage tables. Grouping the flat table by row.group carries
    // each team's FIRST-ROUND group letter for the whole tournament, so a
    // 20-team World Cup showed a "Group A" holding India's Super 8 and knockout
    // matches too — 9 played, against teams from three other groups.
    const groups = {};
    if (stages.length) {
      stages.forEach((st) => { groups[st.name] = st.rows; });
    } else {
      pointsTable.forEach(row => {
        const g = row.group || 'Unassigned';
        if (!groups[g]) groups[g] = [];
        groups[g].push(row);
      });
    }

    // Stages arrive in playing order; group letters sort alphabetically.
    const sortedGroups = stages.length ? stages.map((st) => st.name) : Object.keys(groups).sort();
    // How many advance per group: with multiple groups, top 2 each is the norm
    // (Classic T20); a single group table highlights the top 2 as well.
    // How many advance, per stage, counted by the server from who actually
    // appears in a later stage — not the flat 2 this assumed, which is right
    // for a World Cup group and wrong for a four-team group where one goes
    // through, or an IPL-style top four. null means nothing after this stage
    // has been drawn yet, so nothing is highlighted rather than guessed.
    const qualifyFor = (name) => {
      const st = stages.find((x) => x.name === name);
      return stages.length ? (st ? st.advancing : null) : 2;
    };

    return (
      <ScrollView {...hideTabBar} contentContainerStyle={styles.tabContent}>
        {pointsTable.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="table-large" size={36} color={DS.textMuted} />
            <Text style={styles.emptyText}>No results recorded yet</Text>
          </View>
        ) : (
          sortedGroups.map(groupName => (
            <View key={groupName} style={{ marginBottom: 24 }}>
              {groupName !== 'Unassigned' && (
                <Text style={{ fontSize: 16, fontWeight: '700', color: DS.textPrimary, marginBottom: 8, marginLeft: 4 }}>
                  {/* A stage names itself ("Group A", "Super 8 Group 1"); a bare
                      group letter needs the word in front of it. */}
                  {stages.length ? groupName : `Group ${groupName}`}
                </Text>
              )}
              {/* Table Header */}
              <View style={[styles.ptRow, styles.ptHeader]}>
                <Text style={[styles.ptCell, styles.ptTeamCell, styles.ptHeaderText]}>#  Team</Text>
                <Text style={[styles.ptNum, styles.ptHeaderText]}>P</Text>
                <Text style={[styles.ptNum, styles.ptHeaderText]}>W</Text>
                <Text style={[styles.ptNum, styles.ptHeaderText]}>L</Text>
                <Text style={[styles.ptNum, styles.ptHeaderText]}>Pts</Text>
                <Text style={[styles.ptNum, styles.ptHeaderText]}>{tbKey}</Text>
              </View>
              
              {groups[groupName].map((row, idx) => {
                const qualifyN = qualifyFor(groupName);
                const qualifies = qualifyN != null && idx < qualifyN && (row.played || 0) > 0;
                const form = formFor(row.teamId);
                return (
                <View key={row.teamId} style={[styles.ptRow, idx % 2 === 0 && styles.ptRowAlt, qualifies && styles.ptRowQualified]}>
                  <View style={[styles.ptCell, styles.ptTeamCell]}>
                    <Text style={[styles.ptNum, { color: qualifies ? DS.lime : DS.textMuted, width: 20, fontWeight: qualifies ? '800' : '400' }]}>{idx + 1}</Text>
                    <View style={styles.ptAvatar}>
                      <Text style={styles.ptAvatarText}>{row.team?.name?.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ptTeamName} numberOfLines={1}>{row.team?.name}</Text>
                      {form.length > 0 && (
                        <View style={styles.formRow}>
                          {form.map((r, i) => (
                            <View key={i} style={[styles.formDot, { backgroundColor: FORM_C[r] }]}>
                              <Text style={styles.formDotText}>{r}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={styles.ptNum}>{row.played}</Text>
                  <Text style={styles.ptNum}>{row.won}</Text>
                  <Text style={styles.ptNum}>{row.lost}</Text>
                  <Text style={[styles.ptNum, { fontWeight: '700', color: DS.textPrimary }]}>{row.points}</Text>
                  <Text style={[styles.ptNum, { color: tbPositive(row) ? DS.lime : DS.coral }]}>
                    {tbValue(row)}
                  </Text>
                </View>
              );})}
              {groups[groupName].some((r) => (r.played || 0) > 0) && qualifyFor(groupName) != null && (
                <View style={styles.qualLegend}>
                  <View style={[styles.formDot, { backgroundColor: DS.lime, width: 8, height: 8, borderRadius: 4 }]} />
                  <Text style={styles.qualLegendText}>Top {qualifyFor(groupName)} advance</Text>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    );
  };

  const renderFixture = (item, index) => {
    // Red is reserved for LIVE; upcoming VS is neutral slate, completed FT is success.
    const STATUS_C = { scheduled: DS.textVariant, live: DS.live, completed: DS.success };
    const completed = item.status === 'completed';
    const isLive = item.status === 'live';
    const bothKnown = !!item.team1?.id && !!item.team2?.id;
    // Only the organiser can start/score/record fixtures.
    const actionable = isOrganizer && bothKnown && !completed && ['upcoming', 'ongoing'].includes(tournament.status);
    const isCricket = (tournament.sport || 'cricket') === 'cricket';
    const s1 = item.resultStats?.[item.team1?.id]?.scored;
    const s2 = item.resultStats?.[item.team2?.id]?.scored;
    const ov1 = item.resultStats?.[item.team1?.id]?.oversFaced;
    const ov2 = item.resultStats?.[item.team2?.id]?.oversFaced;
    const totalOv = tournament.overs;
    const oversLabel = (ov) => ov != null ? ` (${ov}${totalOv ? `/${totalOv}` : ''})` : (totalOv ? ` (${totalOv} ov)` : '');
    const win1 = completed && item.winnerTeamId && item.winnerTeamId === item.team1?.id;
    const win2 = completed && item.winnerTeamId && item.winnerTeamId === item.team2?.id;
    return (
      <View key={item.id} style={styles.fixtureCard}>
        <View style={styles.fixtureMeta}>
          <Text style={styles.roundText}>Match {index + 1}</Text>
          {!!item.scheduledAt && (
            <Text style={styles.dateText}>
              {new Date(item.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              {'  '}
              {new Date(item.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>
        <View style={styles.fixtureTeams}>
          <View style={styles.fixtureTeamCol}>
            <HexAvatar size={52} color={DS.surfaceHigh}>
              <Text style={[styles.fixtureAvatarText, { color: DS.blue }]}>{initials2(item.team1?.name || item.placeholder1)}</Text>
            </HexAvatar>
            <Text style={[styles.fixtureTeamName, win1 && styles.winnerName]} numberOfLines={2}>
              {item.team1?.name || item.placeholder1 || 'TBD'}
            </Text>
            {completed && s1 != null && <Text style={styles.fixtureScore}>{s1}<Text style={styles.fixtureScoreOvers}>{oversLabel(ov1)}</Text></Text>}
          </View>
          <View style={[styles.vsChip, { backgroundColor: STATUS_C[item.status] || DS.textVariant }]}>
            <Text style={styles.vsText}>{completed ? 'FT' : isLive ? 'LIVE' : 'VS'}</Text>
          </View>
          <View style={styles.fixtureTeamCol}>
            <HexAvatar size={52} color={DS.surfaceHigh}>
              <Text style={[styles.fixtureAvatarText, { color: DS.lime }]}>{initials2(item.team2?.name || item.placeholder2)}</Text>
            </HexAvatar>
            <Text style={[styles.fixtureTeamName, win2 && styles.winnerName]} numberOfLines={2}>
              {item.team2?.name || item.placeholder2 || 'TBD'}
            </Text>
            {completed && s2 != null && <Text style={styles.fixtureScore}>{s2}<Text style={styles.fixtureScoreOvers}>{oversLabel(ov2)}</Text></Text>}
          </View>
        </View>
        {!!item.venue && (
          <View style={styles.venueRow}>
            <Icon name="map-marker-outline" size={12} color={DS.textMuted} />
            <Text style={styles.venueText}>{item.venue}</Text>
          </View>
        )}
        {actionable && (
          <View style={styles.fixtureActions}>
            {isLive ? (
              <TouchableOpacity style={styles.startBtn} onPress={() => resumeFixtureMatch(item)} disabled={processing} activeOpacity={0.85}>
                <Icon name="play-circle" size={16} color={DS.white} />
                <Text style={styles.startBtnText}>Resume Scoring</Text>
              </TouchableOpacity>
            ) : isCricket ? (
              <>
                <TouchableOpacity style={styles.startBtn} onPress={() => startFixtureMatch(item)} disabled={processing} activeOpacity={0.85}>
                  <Icon name="cricket" size={16} color={DS.white} />
                  <Text style={styles.startBtnText}>{processing ? 'Starting…' : 'Start Match & Score'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openResult(item)} disabled={processing} activeOpacity={0.7}>
                  <Text style={styles.manualLink}>Enter result manually</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.scoreCta} onPress={() => openResult(item)} disabled={processing} activeOpacity={0.7}>
                <Icon name="whistle-outline" size={13} color={DS.lime} />
                <Text style={styles.scoreCtaText}>Tap to record result</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderSchedule = () => {
    if (schedule.length === 0) {
      return (
        <View style={styles.empty}>
          <Icon name="calendar-blank-outline" size={36} color={DS.textMuted} />
          <Text style={styles.emptyText}>No fixtures scheduled</Text>
          {isOrganizer && ['upcoming', 'ongoing'].includes(tournament.status) && (tournament.teams || []).length >= 2 && (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowAutoScheduleModal(true)} disabled={processing}>
              <Text style={styles.primaryBtnText}>{processing ? 'Scheduling...' : 'Auto-Generate Schedule'}</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    // Group fixtures by round (preserving first-appearance order) so the list
    // reads as a bracket: Group A/B → Quarter/Semi-Final → Final.
    const rounds = [];
    const byRound = {};
    let globalIdx = 0;
    for (const f of schedule) {
      const r = f.round || 'Fixtures';
      if (!byRound[r]) { byRound[r] = []; rounds.push(r); }
      byRound[r].push({ f, idx: globalIdx++ });
    }
    // Same rule as the bracket: the phase decides, the label is the fallback.
    const knockoutRounds = new Set(
      schedule.filter((m) => m.phase?.type === 'knockout').map((m) => m.round));
    const isKnockout = (r) => (knockoutRounds.size
      ? knockoutRounds.has(r)
      : !r.startsWith('Group ') && r !== 'Fixtures');
    const hasBracket = rounds.some(isKnockout);
    const toggle = hasBracket && (
      <View style={styles.segment}>
        {['fixtures', 'bracket'].map((v) => (
          <TouchableOpacity key={v} style={[styles.segmentBtn, scheduleView === v && styles.segmentBtnActive]}
            onPress={() => setScheduleView(v)} activeOpacity={0.85}>
            <Icon name={v === 'bracket' ? 'tournament' : 'format-list-bulleted'} size={14} color={scheduleView === v ? DS.bg : DS.textMuted} />
            <Text style={[styles.segmentTxt, scheduleView === v && styles.segmentTxtActive]}>{v === 'bracket' ? 'Bracket' : 'Fixtures'}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
    if (hasBracket && scheduleView === 'bracket') {
      return (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>{toggle}</View>
          {renderBracket()}
        </View>
      );
    }
    return (
      <ScrollView {...hideTabBar} contentContainerStyle={styles.tabContent}>
        {toggle}
        {rounds.map((r) => {
          const done = byRound[r].every(({ f }) => f.status === 'completed');
          return (
            <View key={r} style={styles.roundSection}>
              <View style={styles.roundHeader}>
                {isKnockout(r) && <Icon name="tournament" size={15} color={DS.lime} />}
                <Text style={styles.roundHeaderText}>{r}</Text>
                <View style={{ flex: 1 }} />
                {done && <Icon name="check-circle" size={14} color={DS.lime} />}
              </View>
              {byRound[r].map(({ f, idx }) => renderFixture(f, idx))}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  // Visual knockout bracket: rounds as columns (QF → SF → Final), later rounds
  // vertically centered so it reads as a tree. Group-stage matches are excluded.
  const renderBracket = () => {
    // A fixture is a knockout one because its PHASE says so, not because its
    // round label happens not to begin with "Group ". That test read
    // "Super 8 Group 1" as a knockout round and drew twelve round-robin
    // fixtures into the bracket alongside the semis and the final.
    // The label test stays as the fallback for tournaments with no phases.
    const ko = schedule.filter((m) =>
      m.phase ? m.phase.type === 'knockout'
        : m.round && !m.round.startsWith('Group ') && m.round !== 'Fixtures');
    if (!ko.length) {
      return (
        <View style={styles.empty}>
          <Icon name="tournament" size={36} color={DS.textMuted} />
          <Text style={styles.emptyText}>No knockout bracket yet</Text>
          <Text style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>Generate a knockout schedule to see the bracket.</Text>
        </View>
      );
    }
    const byRound = {};
    for (const m of ko) (byRound[m.round] ||= []).push(m);
    const roundNames = Object.keys(byRound).sort((a, b) => {
      const ta = Math.min(...byRound[a].map((m) => new Date(m.scheduledAt || 0).getTime()));
      const tb = Math.min(...byRound[b].map((m) => new Date(m.scheduledAt || 0).getTime()));
      return ta - tb;
    });
    const SLOT = 92;
    const colHeight = Math.max(byRound[roundNames[0]].length, 1) * SLOT;

    const bracketBox = (m) => {
      const s1 = m.resultStats?.[m.team1?.id]?.scored;
      const s2 = m.resultStats?.[m.team2?.id]?.scored;
      const done = m.status === 'completed';
      const win1 = done && m.winnerTeamId && m.winnerTeamId === m.team1?.id;
      const win2 = done && m.winnerTeamId && m.winnerTeamId === m.team2?.id;
      const side = (name, score, win, isTop) => (
        <View style={[styles.brSide, isTop && styles.brSideTop, win && styles.brSideWin]}>
          <Text style={[styles.brName, win && styles.brNameWin]} numberOfLines={1}>{name}</Text>
          {done && score != null && <Text style={[styles.brScore, win && styles.brNameWin]}>{score}</Text>}
        </View>
      );
      return (
        <View key={m.id} style={styles.brBox}>
          {side(m.team1?.name || m.placeholder1 || 'TBD', s1, win1, true)}
          {side(m.team2?.name || m.placeholder2 || 'TBD', s2, win2, false)}
        </View>
      );
    };

    return (
      <ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', height: colHeight }}>
            {roundNames.map((r) => (
              <View key={r} style={styles.brCol}>
                <Text style={styles.brRoundHead} numberOfLines={1}>{r}</Text>
                <View style={{ flex: 1, justifyContent: 'space-around' }}>
                  {byRound[r].map((m) => bracketBox(m))}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
    );
  };

  const renderLeaders = () => {
    if (!leaderboard) {
      return <View style={styles.centered}><ActivityIndicator color={DS.lime} /></View>;
    }
    // `awards` are the real honours — Player of the Series and the best batter /
    // bowler / fielder, on the same MVP points that decide Man of the Match, so
    // a series award means what a match award means. `mvp` is the older
    // fantasy-points list (runs + boundaries + 20/wicket) that used to fill the
    // hero card and disagreed with the awards the scorer had just handed out.
    const { batsmen, bowlers, awards = [] } = leaderboard;
    const series = awards.find((a) => a.kind === 'series');
    const minorAwards = awards.filter((a) => a.kind !== 'series');
    if (!batsmen.length && !bowlers.length) {
      return (
        <View style={styles.empty}>
          <Icon name="chart-box-outline" size={36} color={DS.textMuted} />
          <Text style={styles.emptyText}>No stats yet</Text>
          <Text style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>
            Play a fixture through “Start Match & Score” to build the leaderboard.
          </Text>
        </View>
      );
    }
    const capRow = (rank, name, team, main, sub, highlight) => (
      <View key={name + rank} style={[styles.ptRow, rank % 2 === 0 && styles.ptRowAlt, rank === 1 && highlight]}>
        <Text style={[styles.ptNum, { width: 22, color: rank === 1 ? DS.lime : DS.textMuted, fontWeight: rank === 1 ? '800' : '400' }]}>{rank}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.ptTeamName} numberOfLines={1}>{name}</Text>
          {!!team && <Text style={styles.leaderTeam} numberOfLines={1}>{team}</Text>}
          {!!sub && <Text style={styles.leaderSub}>{sub}</Text>}
        </View>
        <Text style={styles.leaderMain}>{main}</Text>
      </View>
    );
    return (
      <ScrollView {...hideTabBar} contentContainerStyle={styles.tabContent}>
        {series && (
          <View style={styles.mvpCard}>
            <Icon name="trophy-variant" size={22} color={DS.bg} />
            <View style={{ flex: 1 }}>
              <Text style={styles.mvpLabel}>Player of the Series</Text>
              <Text style={styles.mvpName} numberOfLines={1}>{series.playerName}</Text>
              {!!series.teamName && <Text style={styles.mvpSub} numberOfLines={1}>{series.teamName} · {series.detail}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.mvpStat}>{series.points}</Text>
              <Text style={styles.mvpLabel}>MVP pts</Text>
            </View>
          </View>
        )}

        {/* Best batter / bowler / fielder of the series, alongside the caps
            below: the caps rank on raw runs and wickets, these on MVP points,
            so a 30-ball 40 that won a game can beat a slow 60 that didn't. */}
        {minorAwards.length > 0 && (
          <View style={styles.awardRow}>
            {minorAwards.map((a) => (
              <View key={a.kind} style={styles.awardCard}>
                <Icon name={SERIES_AWARD_ICON[a.kind] || 'medal'} size={15} color={DS.lime} />
                <Text style={styles.awardLabel} numberOfLines={1}>{a.label}</Text>
                <Text style={styles.awardName} numberOfLines={1}>{a.playerName}</Text>
                <Text style={styles.awardPts}>{a.points} pts</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.leaderTitle}>🧡  Orange Cap · Most Runs</Text>
        {batsmen.map((b, i) => capRow(i + 1, b.name, b.team, `${b.runs}`,
          `${b.balls}b · SR ${b.strikeRate} · ${b.fours}×4 ${b.sixes}×6 · HS ${b.highest}`, styles.orangeLead))}

        <Text style={[styles.leaderTitle, { marginTop: 24 }]}>🟣  Purple Cap · Most Wickets</Text>
        {bowlers.map((b, i) => capRow(i + 1, b.name, b.team, `${b.wickets}`,
          `${b.overs} ov · econ ${b.economy} · ${b.runs} runs`, styles.purpleLead))}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header. The cover image and the logo are uploaded on the create screen
          and were never drawn anywhere — the banner sits behind the title, the
          logo beside it. Without either, this is the same header as before. */}
      <View style={styles.header}>
        {!!tournament.banner && (
          <>
            <FocusedImage uri={tournament.banner} focus={tournament.media?.bannerFocus} style={styles.coverImg} />
            {/* The title has to stay readable on whatever photo lands here. */}
            <View style={styles.coverScrim} />
          </>
        )}

        {/* Three rows, not one.
            Back, logo, title and Edit were all siblings in a single row, so the
            title got whatever width the other three left it — about 230 of 411
            — and a name like "Maduravoyal Premier League" truncated at two
            lines while the chips underneath wrapped and staggered inside the
            same narrow column. The controls get their own row; the name and the
            chips get the full width. */}
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
            <Icon name="arrow-left" size={22} color={onCover ? '#fff' : DS.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {/* Everything the organiser typed on the way in is editable on the
              way back — the create wizard reopens with this tournament. */}
          {isOrganizer && (
            <TouchableOpacity
              style={[styles.editBtn, onCover && { borderColor: '#fff', backgroundColor: '#00000040' }]}
              onPress={() => navigation.navigate('CreateTournament', { tournamentId })}
              activeOpacity={0.85}>
              <Icon name="pencil-outline" size={14} color={onCover ? '#fff' : DS.lime} />
              <Text style={[styles.editBtnText, onCover && { color: '#fff' }]}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.headerMain}>
          {!!tournament.logoUrl && (
            <Image source={{ uri: tournament.logoUrl }} style={styles.logoImg} resizeMode="cover" />
          )}
          <View style={{ flex: 1 }}>
            <View style={styles.eyebrowRow}>
              <Icon name="trophy-outline" size={13} color={onCover ? '#ffffffcc' : DS.textMuted} />
              <Text style={[styles.eyebrowText, onCover && { color: '#ffffffcc' }]} numberOfLines={1}>
                {tournament.shortName || 'TOURNAMENT DETAILS'}
              </Text>
            </View>
            <Text style={[styles.headerTitle, onCover && { color: '#fff' }]} numberOfLines={2}>
              {tournament.name}
            </Text>
          </View>
        </View>

        {/* One row, left-aligned under the name, wrapping as a set. Over a cover
            they all take the same translucent treatment so they read as one
            group — the status pill was tinted lime-on-lime, which went to mush
            against a photo. */}
        <View style={styles.headerChips}>
          <View style={[styles.statusChip, onCover
            ? { backgroundColor: statusColor.text }
            : { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.statusText, { color: onCover ? '#fff' : statusColor.text }]}>
              {tournament.status?.toUpperCase()}
            </Text>
          </View>
          {!!tournament.category && (
            <View style={[styles.metaChip, onCover && styles.metaChipOnCover]}>
              <Icon name="sitemap-outline" size={11} color={onCover ? '#fff' : DS.textVariant} />
              <Text style={[styles.metaChipText, onCover && { color: '#fff' }]}>{tournament.category}</Text>
            </View>
          )}
          {!!(tournament.city || tournament.venue) && (
            <View style={[styles.metaChip, onCover && styles.metaChipOnCover]}>
              <Icon name="map-marker" size={11} color={onCover ? '#fff' : DS.textVariant} />
              <Text style={[styles.metaChipText, onCover && { color: '#fff' }]} numberOfLines={1}>
                {tournament.city || tournament.venue}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Champion banner (once completed) */}
      {tournament.status === 'completed' && tournament.championId && (
        <View style={styles.championBanner}>
          <Icon name="trophy" size={18} color="#fff" />
          <Text style={styles.championText}>
            Champions: {(tournament.teams || []).find(t => t.team?.id === tournament.championId)?.team?.name || 'TBD'}
          </Text>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'Overview' && renderOverview()}
      {activeTab === 'Points Table' && renderPointsTable()}
      {activeTab === 'Schedule' && renderSchedule()}
      {activeTab === 'Leaders' && renderLeaders()}

      {['upcoming', 'ongoing'].includes(tournament.status) && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowTeamPicker(true)} activeOpacity={0.85}>
          <Icon name="plus" size={28} color={DS.white} />
        </TouchableOpacity>
      )}

      {showTeamPicker && (
        <Modal transparent animationType="slide">
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {pickerMode === 'join' ? 'Request to Join' : 'Select Teams'} {pickerMode === 'add' && tournament?.maxTeams ? `(${(tournament?.teams || []).length + selectedTeamIds.size}/${tournament.maxTeams})` : ''}
                </Text>
                <TouchableOpacity onPress={() => setShowTeamPicker(false)}>
                  <Icon name="close" size={24} color={DS.textPrimary} />
                </TouchableOpacity>
              </View>
              {pickerMode === 'join' && (
                <Text style={[styles.emptyText, { textAlign: 'left', marginBottom: 8 }]}>
                  Pick one of your teams to request entry. The organiser approves it before you're in.
                </Text>
              )}
              {(() => {
                // Organiser adds any same-sport team directly (approved on the
                // spot); a participant requests with a team they own or play for,
                // and the organiser approves each request individually.
                const pickable = pickerMode === 'join' ? myEntryTeams : myTeams;
                if (pickable.length === 0) {
                  return <Text style={styles.emptyText}>{pickerMode === 'join' ? "You're not in any teams for this sport yet." : 'No teams available.'}</Text>;
                }
                // Teams the caller has already asked about. The tournament
                // payload only carries APPROVED teams, so a pending request was
                // invisible here: you could tap Request again and get an error
                // toast instead of seeing the row disabled.
                const pendingIds = new Set(myRequests.filter(r => r.status === 'pending').map(r => r.team?.id));
                return (
                <>
                  <ScrollView>
                    {pickable.map(t => {
                      const isRegistered = (tournament?.teams || []).some(rt => rt.team.id === t.id);
                      const isPending = pickerMode === 'join' && pendingIds.has(t.id);
                      const blocked = isRegistered || isPending;
                      const isSelected = selectedTeamIds.has(t.id);
                      return (
                        <TouchableOpacity key={t.id} style={[styles.teamSelectRow, blocked && { opacity: 0.5 }]}
                                          onPress={() => !blocked && toggleTeamSelection(t.id)}
                                          disabled={processing || blocked}>
                          <View style={styles.teamAvatar}><Text style={styles.teamAvatarText}>{t.name?.charAt(0).toUpperCase()}</Text></View>
                          <Text style={styles.teamSelectName}>
                            {t.name} {isRegistered ? '(Registered)' : isPending ? '(Requested)' : ''}
                          </Text>
                          <View style={{ flex: 1 }} />
                          {isSelected && <Icon name="check-circle" size={20} color={DS.lime} />}
                          {!isSelected && !blocked && <Icon name="circle-outline" size={20} color={DS.textMuted} />}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  {/* A line of context, so the organiser doesn't have to open a
                      chat just to find out who you are. */}
                  {pickerMode === 'join' && (
                    <TextInput
                      style={styles.noteInput}
                      placeholder="Add a note for the organiser (optional)"
                      placeholderTextColor={DS.textMuted}
                      value={requestNote}
                      onChangeText={setRequestNote}
                      maxLength={280}
                      multiline
                    />
                  )}
                  <TouchableOpacity
                    style={[styles.primaryBtn, { marginTop: 16 }, selectedTeamIds.size === 0 && { opacity: 0.5 }]}
                    onPress={handleRegisterSelectedTeams}
                    disabled={processing || selectedTeamIds.size === 0}>
                    <Text style={styles.primaryBtnText}>
                      {processing
                        ? (pickerMode === 'join' ? 'Sending…' : 'Registering...')
                        : pickerMode === 'join'
                          ? `Request to Join (${selectedTeamIds.size})`
                          : `Register ${selectedTeamIds.size} Team${selectedTeamIds.size !== 1 ? 's' : ''}`}
                    </Text>
                  </TouchableOpacity>
                </>
                );
              })()}
            </View>
          </View>
        </Modal>
      )}

      {/* Auto-Schedule Modal */}
      <Modal visible={showAutoScheduleModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Auto-Generate Schedule</Text>
              <TouchableOpacity onPress={() => setShowAutoScheduleModal(false)}>
                <Icon name="close" size={24} color={DS.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.infoLabel}>Format</Text>
            <View style={{ gap: 10, marginTop: 8, marginBottom: 16 }}>
              {[
                { id: 'sudden_death', name: 'Sudden-Death Semi', rules: 'League matches followed by Semi-Finals.\nOnly the 1st Place team from each group advances.' },
                { id: 'classic_t20', name: 'Classic T20', rules: 'League matches followed by Quarter-Finals.\nThe 1st and 2nd Place teams from each group advance.' },
                { id: 'ipl_style', name: 'IPL-Style Marathon', rules: 'Big League followed by Page Playoffs.\nTop 2 advance to Q1, Eliminator, and Q2.' },
                { id: 'knockout', name: 'Pure Knockout', rules: 'Standard bracket. Losers are eliminated immediately.\nByes are automatically calculated.' }
              ].map(fmt => (
                <View key={fmt.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity style={[styles.formatBtn, scheduleFormat === fmt.id && styles.formatBtnActive]} onPress={() => setScheduleFormat(fmt.id)}>
                    <Text style={[styles.formatBtnText, scheduleFormat === fmt.id && styles.formatBtnTextActive]}>
                      {fmt.name}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Alert.alert(fmt.name, fmt.rules)} style={styles.infoBtn}>
                    <Icon name="information-outline" size={24} color={DS.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {scheduleFormat !== 'knockout' && (
              <>
                <Text style={styles.infoLabel}>Group Assignment</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 16 }}>
                  <TouchableOpacity style={[styles.formatBtn, autoSplit && styles.formatBtnActive]} onPress={() => setAutoSplit(true)}>
                    <Text style={[styles.formatBtnText, autoSplit && styles.formatBtnTextActive]}>Auto Split</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.formatBtn, !autoSplit && styles.formatBtnActive]} onPress={() => setAutoSplit(false)}>
                    <Text style={[styles.formatBtnText, !autoSplit && styles.formatBtnTextActive]}>Manual Assign</Text>
                  </TouchableOpacity>
                </View>

                {!autoSplit && (
                  <View style={{ maxHeight: 200, marginBottom: 16, backgroundColor: DS.surfaceLow, borderRadius: 8, padding: 8 }}>
                    <ScrollView nestedScrollEnabled>
                      {(tournament?.teams || []).map(t => (
                        <View key={t.team.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, backgroundColor: DS.surfaceMedium, padding: 8, borderRadius: 8 }}>
                          <Text style={{ color: DS.textPrimary, fontWeight: '600', flex: 1 }} numberOfLines={1}>{t.team.name}</Text>
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                            {['A', 'B', 'C', 'D'].map(grp => (
                              <TouchableOpacity key={grp} 
                                style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: manualGroups[t.team.id] === grp ? DS.lime : DS.surfaceHighest, borderRadius: 4 }}
                                onPress={() => setManualGroups(prev => ({ ...prev, [t.team.id]: grp }))}>
                                <Text style={{ color: manualGroups[t.team.id] === grp ? DS.bg : DS.textPrimary, fontSize: 12, fontWeight: '700' }}>{grp}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            )}

            <TouchableOpacity 
              style={styles.primaryBtn} 
              onPress={() => { setShowAutoScheduleModal(false); handleAutoSchedule(); }} 
              disabled={processing}>
              <Text style={styles.primaryBtnText}>
                {processing ? 'Generating...' : 'Generate Schedule'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Record Result Modal */}
      <Modal visible={!!resultFixture} transparent animationType="slide" onRequestClose={() => setResultFixture(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Result</Text>
              <TouchableOpacity onPress={() => setResultFixture(null)}>
                <Icon name="close" size={24} color={DS.textPrimary} />
              </TouchableOpacity>
            </View>
            {!!resultFixture?.round && <Text style={styles.infoLabel}>{resultFixture.round}</Text>}

            <View style={styles.resultRow}>
              <Text style={styles.resultTeam} numberOfLines={1}>{resultFixture?.team1?.name}</Text>
              <TextInput
                style={styles.resultScoreInput} value={scoreA} onChangeText={setScoreA}
                keyboardType="number-pad" placeholder="0" placeholderTextColor={DS.textMuted} maxLength={4} />
              <TextInput
                style={styles.resultOversInput} value={oversA} onChangeText={setOversA}
                keyboardType="decimal-pad" placeholder="ov" placeholderTextColor={DS.textMuted} maxLength={4} />
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultTeam} numberOfLines={1}>{resultFixture?.team2?.name}</Text>
              <TextInput
                style={styles.resultScoreInput} value={scoreB} onChangeText={setScoreB}
                keyboardType="number-pad" placeholder="0" placeholderTextColor={DS.textMuted} maxLength={4} />
              <TextInput
                style={styles.resultOversInput} value={oversB} onChangeText={setOversB}
                keyboardType="decimal-pad" placeholder="ov" placeholderTextColor={DS.textMuted} maxLength={4} />
            </View>
            <Text style={styles.resultHint}>Score and overs (overs optional — used for Net Run Rate). Higher score wins; equal = tie.</Text>

            {/* Abandoned matches had nowhere to go. The API has accepted a
                noResult since it was written and the table scores it — a point
                each, and no Net Run Rate, because a match that didn't finish
                shouldn't move a run rate. Without this the only way to file a
                washout was to type equal scores, which records a TIE: the same
                points in cricket, but it drags NRR with runs nobody made and
                shows as T in the form guide instead of N. */}
            <TouchableOpacity
              style={[styles.abandonRow, abandoned && styles.abandonRowOn]}
              onPress={() => setAbandoned((v) => !v)}
              activeOpacity={0.85}>
              <Icon name={abandoned ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={18} color={abandoned ? DS.lime : DS.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.abandonLabel}>No result — abandoned</Text>
                <Text style={styles.abandonHint}>Rain, bad light, or never started. A point each, no NRR.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={submitResult} disabled={processing}>
              <Text style={styles.primaryBtnText}>
                {processing ? 'Saving...' : abandoned ? 'Save as No Result' : 'Save Result'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },
  errorText: { fontSize: 18, fontWeight: '700', color: DS.coral, marginTop: 12 },
  header: { backgroundColor: DS.bg, paddingTop: 44, paddingBottom: 14, paddingHorizontal: 16, overflow: 'hidden' },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headerMain: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  coverImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  coverScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000a6' },
  logoImg: { width: 46, height: 46, borderRadius: 14, backgroundColor: DS.surfaceHigh, borderWidth: 1.5, borderColor: DS.lime },
  headerChips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 },
  metaChipOnCover: { backgroundColor: '#ffffff2e' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: DS.lime },
  editBtnText: { fontSize: 12, fontWeight: '800', color: DS.lime },
  abandonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: DS.border, marginTop: 4, marginBottom: 12 },
  abandonRowOn: { borderColor: DS.lime, backgroundColor: DS.lime + '14' },
  abandonLabel: { fontSize: 13.5, fontWeight: '800', color: DS.textPrimary },
  abandonHint: { fontSize: 11, fontWeight: '600', color: DS.textMuted, marginTop: 2 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: DS.surfaceHigh },
  metaChipText: { fontSize: 10, fontWeight: '800', color: DS.textVariant, letterSpacing: 0.3 },
  policyNote: { fontSize: 11, fontWeight: '700', color: DS.textMuted, maxWidth: 150, textAlign: 'right' },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 5 },
  detailKey: { width: 104, fontSize: 12, fontWeight: '700', color: DS.textMuted },
  detailVal: { flex: 1, fontSize: 13, fontWeight: '700', color: DS.textPrimary, textAlign: 'right' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  ruleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.border },
  ruleChipText: { fontSize: 11, fontWeight: '700', color: DS.textVariant },
  contactChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: DS.lime },
  contactChipText: { fontSize: 12, fontWeight: '800', color: DS.lime },
  backBtn: { padding: 4, marginTop: 6 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  eyebrowText: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 1.2 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: DS.textPrimary, letterSpacing: -0.3 },
  statusChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 8 },
  championBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: DS.success, marginHorizontal: 16, marginBottom: 8, paddingVertical: 10, borderRadius: 12 },
  championText: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  leaderTitle: { fontSize: 15, fontWeight: '800', color: DS.textPrimary, marginBottom: 8, marginLeft: 4 },
  leaderTeam: { fontSize: 11, color: DS.textMuted, marginTop: 1 },
  leaderSub: { fontSize: 10, color: DS.textMuted, marginTop: 2 },
  leaderMain: { fontSize: 18, fontWeight: '800', color: DS.textPrimary, minWidth: 42, textAlign: 'right', fontVariant: ['tabular-nums'] },
  orangeLead: { borderLeftWidth: 3, borderLeftColor: '#ff8c1a' },
  purpleLead: { borderLeftWidth: 3, borderLeftColor: '#a855f7' },
  mvpCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: DS.lime, borderRadius: 14, padding: 14, marginBottom: 12 },
  mvpLabel: { fontSize: 10, fontWeight: '700', color: DS.onLime, opacity: 0.75, letterSpacing: 0.5, textTransform: 'uppercase' },
  mvpName: { fontSize: 18, fontWeight: '800', color: DS.onLime },
  mvpSub: { fontSize: 11, fontWeight: '600', color: DS.onLime, opacity: 0.8, marginTop: 1 },
  mvpStat: { fontSize: 18, fontWeight: '900', color: DS.onLime, fontVariant: ['tabular-nums'] },
  /* The other three series honours, three across under the hero card. */
  awardRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  awardCard: { flex: 1, gap: 3, backgroundColor: DS.surface, borderRadius: 12, borderWidth: 1, borderColor: DS.border, paddingHorizontal: 10, paddingVertical: 10 },
  awardLabel: { fontSize: 9, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  awardName: { fontSize: 13, fontWeight: '800', color: DS.textPrimary },
  awardPts: { fontSize: 10, fontWeight: '700', color: DS.textMuted, fontVariant: ['tabular-nums'] },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  tabs: { flexDirection: 'row', backgroundColor: DS.bg, borderBottomWidth: 1, borderBottomColor: DS.faint },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: DS.lime },
  tabText: { fontSize: 13, fontWeight: '600', color: DS.textMuted },
  tabTextActive: { color: DS.lime, fontWeight: '700' },
  tabContent: { padding: 16, gap: 12, paddingBottom: 96 },

  // Overview
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoCard: { width: '47%', backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16, alignItems: 'center' },
  infoLabel: { fontSize: 11, color: DS.textMuted, marginTop: 4 },
  infoValue: { fontSize: 13, fontWeight: '700', color: DS.textPrimary, marginTop: 2, textAlign: 'center' },
  section: { backgroundColor: DS.surface, borderRadius: 16, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: DS.textPrimary, marginBottom: 10 },
  descText: { fontSize: 14, color: DS.textVariant, lineHeight: 20 },
  organizerText: { fontSize: 14, fontWeight: '600', color: DS.textPrimary },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: DS.faint },
  teamAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  teamAvatarText: { fontSize: 14, fontWeight: '800', color: DS.white },
  teamName: { fontSize: 15, fontWeight: '700', color: DS.textPrimary },
  teamCaptain: { fontSize: 12, color: DS.textMuted, marginTop: 2 },
  groupBadge: { backgroundColor: DS.surfaceHigh, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  groupText: { fontSize: 11, color: DS.textVariant, fontWeight: '700' },
  countBadge: { backgroundColor: DS.surfaceHigh, minWidth: 26, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, alignItems: 'center' },
  countBadgeText: { fontSize: 12, fontWeight: '800', color: DS.textVariant },
  showAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 14 },
  viewAllText: { fontSize: 14, fontWeight: '700', color: DS.blue },
  mediaCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 14, marginTop: 4 },
  mediaThumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center' },
  mediaTitle: { fontSize: 15, fontWeight: '800', color: DS.textPrimary },
  mediaSub: { fontSize: 12, color: DS.textMuted, marginTop: 3, lineHeight: 17 },
  mediaLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 8 },
  mediaLink: { fontSize: 13, fontWeight: '700', color: DS.blue },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: DS.blueDeep, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: DS.blueDeep, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },

  // Points Table
  ptRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  ptRowAlt: { backgroundColor: DS.surfaceLow },
  ptHeader: { backgroundColor: DS.surfaceHighest, borderRadius: 8 },
  ptHeaderText: { color: DS.textPrimary, fontWeight: '700' },
  ptCell: { flexDirection: 'row', alignItems: 'center' },
  ptTeamCell: { flex: 1, gap: 6 },
  ptAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  ptAvatarText: { fontSize: 11, color: DS.lime, fontWeight: '700' },
  ptTeamName: { fontSize: 12, color: DS.textPrimary },
  ptNum: { width: 36, textAlign: 'center', fontSize: 12, color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  ptBold: { fontWeight: '700', color: DS.lime },
  ptRowQualified: { borderLeftWidth: 3, borderLeftColor: DS.lime },
  formRow: { flexDirection: 'row', gap: 3, marginTop: 3 },
  formDot: { width: 14, height: 14, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  formDotText: { fontSize: 8, fontWeight: '800', color: DS.bg },
  qualLegend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginLeft: 4 },
  qualLegendText: { fontSize: 10, color: DS.textMuted },

  // Schedule
  segment: { flexDirection: 'row', backgroundColor: DS.surfaceLow, borderRadius: 10, padding: 3, marginBottom: 16 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8 },
  segmentBtnActive: { backgroundColor: DS.lime },
  segmentTxt: { fontSize: 12, fontWeight: '700', color: DS.textMuted },
  segmentTxtActive: { color: DS.bg },
  brCol: { width: 148, marginRight: 26, justifyContent: 'flex-start' },
  brRoundHead: { fontSize: 12, fontWeight: '800', color: DS.lime, marginBottom: 8, letterSpacing: 0.3 },
  brBox: { backgroundColor: DS.surfaceHigh, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: DS.line },
  brSide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  brSideTop: { borderBottomWidth: 1, borderBottomColor: DS.line },
  brSideWin: { backgroundColor: '#1a2e1a' },
  brName: { flex: 1, fontSize: 12, fontWeight: '600', color: DS.textPrimary },
  brNameWin: { color: DS.lime, fontWeight: '800' },
  brScore: { fontSize: 12, fontWeight: '700', color: DS.textMuted },
  roundSection: { marginBottom: 20, gap: 10 },
  roundHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  roundHeaderText: { fontSize: 14, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.3 },
  fixtureCard: { backgroundColor: DS.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: DS.faint, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  fixtureMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: DS.faint },
  roundText: { fontSize: 11, color: DS.textMuted, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  dateText: { fontSize: 11, color: DS.textVariant, fontWeight: '600' },
  fixtureTeams: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 14 },
  fixtureTeamCol: { flex: 1, alignItems: 'center', gap: 8 },
  fixtureAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  fixtureAvatarText: { fontSize: 16, fontWeight: '900' },
  fixtureTeamName: { fontSize: 13, fontWeight: '700', color: DS.textPrimary, textAlign: 'center' },
  fixtureScore: { fontSize: 15, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  fixtureScoreOvers: { fontSize: 11, fontWeight: '700', color: DS.textMuted, fontVariant: ['tabular-nums'] },
  winnerName: { color: DS.success },
  vsChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6, marginTop: 16, transform: [{ rotate: '-12deg' }] },
  vsText: { fontSize: 10, fontWeight: '900', color: DS.white },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  venueText: { fontSize: 12, color: DS.textMuted },
  scoreCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 },
  scoreCtaText: { fontSize: 11, fontWeight: '700', color: DS.lime },
  fixtureActions: { alignItems: 'center', gap: 10, marginTop: 0 },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', backgroundColor: DS.blueDeep, paddingVertical: 14, borderRadius: 12 },
  startBtnText: { fontSize: 14, fontWeight: '800', color: DS.white },
  manualLink: { fontSize: 12, fontWeight: '700', color: DS.lime, textDecorationLine: 'underline' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  resultTeam: { flex: 1, fontSize: 14, fontWeight: '700', color: DS.textPrimary },
  resultScoreInput: { width: 64, backgroundColor: DS.surfaceLow, borderRadius: 8, paddingVertical: 8, textAlign: 'center', fontSize: 16, fontWeight: '800', color: DS.textPrimary },
  resultOversInput: { width: 48, backgroundColor: DS.surfaceLow, borderRadius: 8, paddingVertical: 8, textAlign: 'center', fontSize: 13, color: DS.textPrimary },
  resultHint: { fontSize: 11, color: DS.textMuted, marginTop: 10 },
  addBtn: { backgroundColor: DS.lime, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12 },
  addBtnText: { fontSize: 13, fontWeight: '800', color: DS.onLime },
  approveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: DS.lime, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  approveBtnText: { fontSize: 12, fontWeight: '800', color: DS.onLime },

  // Join-request card: the team row plus its own action strip, so Message /
  // Decline / Approve get real hit targets instead of being crammed inline.
  requestCard: { marginBottom: 4 },
  requestActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, paddingBottom: 4 },
  teamRecord: { fontSize: 11, color: DS.textMuted, marginTop: 2 },
  // The requester's own words — quoted and indented so it reads as theirs,
  // not as UI copy.
  requestNote: {
    fontSize: 12, color: DS.textVariant, fontStyle: 'italic',
    marginTop: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: DS.border,
  },
  noteInput: {
    marginTop: 12, minHeight: 44, maxHeight: 88,
    backgroundColor: DS.surfaceLow, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: DS.textPrimary,
    borderWidth: 1, borderColor: DS.border, textAlignVertical: 'top',
  },
  unreadDot: {
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
    backgroundColor: DS.live, alignItems: 'center', justifyContent: 'center', marginLeft: 2,
  },
  unreadDotText: { fontSize: 9, fontWeight: '900', color: DS.white },
  msgBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.border,
  },
  msgBtnText: { fontSize: 12, fontWeight: '700', color: DS.textPrimary },
  // Decline is a quiet text button: it shouldn't carry the same visual weight
  // as Approve on a card whose default outcome is letting the team in.
  rejectBtn: { paddingHorizontal: 10, paddingVertical: 7 },
  rejectBtnText: { fontSize: 12, fontWeight: '700', color: DS.coral },
  pendingPill: { backgroundColor: DS.surfaceHigh, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pendingPillText: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.8 },
  primaryBtn: { backgroundColor: DS.lime, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, marginTop: 20 },
  primaryBtnText: { fontSize: 14, fontWeight: '800', color: DS.bg },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: DS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: DS.textPrimary },
  teamSelectRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: DS.line },
  teamSelectName: { fontSize: 16, fontWeight: '700', color: DS.textPrimary },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, fontWeight: '600', color: DS.textMuted, marginTop: 10 },
  formatBtn: { flex: 1, backgroundColor: DS.surfaceHighest, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  formatBtnActive: { backgroundColor: DS.lime },
  formatBtnText: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  formatBtnTextActive: { color: DS.bg },
  infoBtn: { padding: 4 }
});
