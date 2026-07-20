import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, StatusBar, Animated, Dimensions, TextInput, Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Radius } from '../theme';
import legendsApi from '../services/LegendsApi';
import MatchPhotos from '../components/MatchPhotos';
import { useScoringColors, useScoringStyles } from '../theme/scoringTokens';
import { useTheme } from '../theme/ThemeContext';
import { getScoringConfig, cnt, pts, decideWinner } from '../sports/scoring';

const { width: W } = Dimensions.get('window');


/* ═══════════════════════════════════════════════════════════════
   Animated event ball (current over / period log)
   ═══════════════════════════════════════════════════════════════ */
function EventBall({ label, color, size = 32 }) {
  const s = useScoringStyles(makeS);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  }, [anim]);
  return (
    <Animated.View style={[s.ballWrap, {
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color + '20', borderColor: color + '55',
      transform: [{ scale: anim }],
    }]}>
      <Text style={[s.ballText, { color, fontSize: size * 0.38 }]}>{label}</Text>
    </Animated.View>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CRICKET SCORER — Special 3x3 grid layout
   Matches the "Advanced Cricket Scorer" screenshot
   ═══════════════════════════════════════════════════════════════ */
function CricketScorer({ match, cfg, events, period, onAdd, onUndo, saving, matchOver }) {
  const DS = useScoringColors();
  const s = useScoringStyles(makeS);
  const battingTeamId = period === 1 ? match?.team1Id : match?.team2Id;
  const bowlingTeamId = period === 1 ? match?.team2Id : match?.team1Id;
  const battingTeam   = period === 1 ? match?.team1 : match?.team2;
  const bowlingTeam   = period === 1 ? match?.team2 : match?.team1;

  const battingEvents = useMemo(() =>
    events.filter(e => e.periodNum === period && e.teamId === battingTeamId),
  [events, period, battingTeamId]);

  // Compute score, overs, wickets
  const runTypes = ['run-1', 'run-2', 'run-3', 'four', 'six', 'wide', 'no-ball', 'bye', 'leg-bye'];
  const totalRuns    = pts(battingEvents, battingTeamId, runTypes);
  const totalWickets = cnt(battingEvents, battingTeamId, 'wicket');
  const legalBalls   = battingEvents.filter(e => !['wide', 'no-ball'].includes(e.eventType)).length;
  const oversStr     = `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;

  // Current over balls
  const completedOvers = Math.floor(legalBalls / 6);
  const currentOverEvents = useMemo(() => {
    let legal = 0;
    let overStart = 0;
    for (let i = 0; i < battingEvents.length; i++) {
      if (!['wide', 'no-ball'].includes(battingEvents[i].eventType)) legal++;
      if (legal > completedOvers * 6) { overStart = i; break; }
      if (i === battingEvents.length - 1 && legal <= completedOvers * 6) overStart = battingEvents.length;
    }
    return battingEvents.slice(overStart);
  }, [battingEvents, completedOvers]);

  // Ball display for current over (6 slots)
  const overBalls = useMemo(() => {
    const balls = [];
    let legalCount = 0;
    for (const e of currentOverEvents) {
      const isExtra = ['wide', 'no-ball'].includes(e.eventType);
      balls.push({ type: e.eventType, value: e.value, isExtra });
      if (!isExtra) legalCount++;
    }
    // Fill remaining slots
    while (legalCount < 6) {
      balls.push(null);
      legalCount++;
    }
    return balls.slice(0, Math.max(balls.length, 6));
  }, [currentOverEvents]);

  // Second innings target
  const isChasing = period === 2;
  let targetInfo = null;
  if (isChasing) {
    const inn1Events = events.filter(e => e.periodNum === 1);
    const inn1Team   = match?.team1Id;
    const inn1Runs   = pts(inn1Events, inn1Team, runTypes);
    const target     = inn1Runs + 1;
    const needed     = target - totalRuns;
    const totalBallsInMatch = 120; // Default 20 overs
    const ballsLeft  = Math.max(0, totalBallsInMatch - legalBalls);
    targetInfo = { target, needed, ballsLeft };
  }

  const addBattingEvent = (action) => {
    onAdd(battingTeamId, action);
  };

  const getBallLabel = (ball) => {
    if (!ball) return null;
    if (ball.type === 'wide') return 'WD';
    if (ball.type === 'no-ball') return 'NB';
    if (ball.type === 'wicket') return 'W';
    if (ball.type === 'four') return '4';
    if (ball.type === 'six') return '6';
    if (ball.type === 'dot') return '0';
    if (ball.type === 'bye' || ball.type === 'leg-bye') return 'B';
    return String(ball.value);
  };

  const getBallColor = (ball) => {
    if (!ball) return DS.dim;
    if (ball.type === 'wicket') return DS.error;
    if (ball.type === 'four') return DS.pContainer;
    if (ball.type === 'six') return DS.tertiary;
    if (ball.type === 'wide' || ball.type === 'no-ball') return DS.secondary;
    if (ball.type === 'dot') return DS.muted;
    return DS.onSurface;
  };

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* ── Jumbotron Score Bar ──────────────────────── */}
      <View style={s.jumbotron}>
        <View style={s.jumbotronGlow} />
        <View style={s.jumbotronInner}>
          <View style={{ flex: 1 }}>
            <Text style={s.jumbotronLabel}>CURRENT SCORE</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={s.jumbotronScore}>{totalRuns}/{totalWickets}</Text>
              <Text style={s.jumbotronOvers}> ({oversStr})</Text>
            </View>
          </View>
          {isChasing && targetInfo ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.jumbotronTargetLabel}>TARGET: {targetInfo.target}</Text>
              <Text style={s.jumbotronNeed}>
                Need {Math.max(0, targetInfo.needed)} from {targetInfo.ballsLeft} balls
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.jumbotronTargetLabel}>{battingTeam?.toUpperCase()}</Text>
              <Text style={s.jumbotronNeed}>{cfg.periods[period - 1]}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Striker & Bowler Cards ───────────────────── */}
      <View style={s.playerRow}>
        <View style={[s.playerCard, { borderLeftWidth: 3, borderLeftColor: DS.tertiary }]}>
          <Text style={[s.playerCardLabel, { color: DS.tertiary }]}>STRIKER</Text>
          <Text style={s.playerCardName} numberOfLines={1}>{battingTeam || 'Batting'}</Text>
          <Text style={s.playerCardSub}>
            {totalRuns} ({legalBalls}) {'\u2022'} {cnt(battingEvents, battingTeamId, 'four')}x4, {cnt(battingEvents, battingTeamId, 'six')}x6
          </Text>
        </View>
        <View style={[s.playerCard, { borderRightWidth: 3, borderRightColor: DS.primary }]}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.playerCardLabel, { color: DS.primary }]}>BOWLING</Text>
          </View>
          <Text style={[s.playerCardName, { textAlign: 'right' }]} numberOfLines={1}>{bowlingTeam || 'Bowling'}</Text>
          <Text style={[s.playerCardSub, { textAlign: 'right' }]}>
            {oversStr} - {cnt(battingEvents, battingTeamId, 'wicket')}W
          </Text>
        </View>
      </View>

      {/* ── Undo + Extras Bar ───────────────────────── */}
      <View style={s.extrasBar}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.extrasBtn} onPress={onUndo}>
            <Icon name="undo" size={14} color={DS.onVariant} />
            <Text style={s.extrasBtnText}>UNDO</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(cfg.extras || []).map(ex => (
            <TouchableOpacity
              key={ex.type}
              style={s.extrasBtn}
              onPress={() => addBattingEvent(ex)}
              disabled={saving || matchOver}
            >
              <Text style={s.extrasBtnText}>{ex.label.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── 3x3 Scoring Grid ────────────────────────── */}
      <View style={s.scoringGrid}>
        {cfg.actions.map((action) => {
          let btnStyle = [s.gridBtn];
          let numStyle = [s.gridBtnNum];
          let subStyle = [s.gridBtnSub];

          if (action.gridSpecial === 'boundary') {
            btnStyle.push({ backgroundColor: DS.pContainer + '30', borderBottomColor: DS.primary, borderBottomWidth: 3 });
            numStyle.push({ color: DS.primary });
            subStyle.push({ color: DS.primary });
          } else if (action.gridSpecial === 'maximum') {
            btnStyle.push({ backgroundColor: DS.tertiary + '15', borderBottomColor: DS.tertiary, borderBottomWidth: 3 });
            numStyle.push({ color: DS.tertiary });
            subStyle.push({ color: DS.tertiary });
          } else if (action.gridSpecial === 'extra') {
            btnStyle.push({ borderBottomColor: DS.secondary + '60', borderBottomWidth: 3 });
            numStyle.push({ color: DS.secondary });
          } else if (action.gridSpecial === 'wicket') {
            btnStyle.push({ backgroundColor: DS.errBg + '40', borderBottomColor: DS.error, borderBottomWidth: 3 });
            numStyle.push({ color: DS.error });
            subStyle.push({ color: DS.error });
          }

          return (
            <TouchableOpacity
              key={action.type}
              style={btnStyle}
              onPress={() => addBattingEvent(action)}
              disabled={saving || matchOver}
              activeOpacity={0.7}
            >
              {action.icon ? (
                <Icon name={action.icon} size={32} color={action.color} />
              ) : (
                <Text style={numStyle}>{action.label}</Text>
              )}
              <Text style={subStyle}>{action.sub}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Current Over Log ────────────────────────── */}
      <View style={s.overLog}>
        <View style={s.overLogHeader}>
          <Text style={s.overLogTitle}>CURRENT OVER</Text>
          <View style={s.overBalls}>
            {overBalls.slice(0, 8).map((ball, i) => {
              const label = ball ? getBallLabel(ball) : null;
              const color = getBallColor(ball);
              return (
                <View key={i} style={[s.overBallSlot, ball && {
                  backgroundColor: color + '20',
                  borderColor: color + '40',
                }]}>
                  {label ? (
                    <Text style={[s.overBallText, { color }]}>{label}</Text>
                  ) : (
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: DS.dim }} />
                  )}
                </View>
              );
            })}
          </View>
        </View>
        {/* Momentum meter */}
        <View style={s.momentumTrack}>
          <View style={[s.momentumFill, {
            width: `${Math.min(100, Math.max(10, totalRuns / Math.max(1, totalRuns + totalWickets * 10) * 100))}%`,
            backgroundColor: DS.tertiary,
          }]} />
          <View style={{ flex: 1, backgroundColor: DS.secondary + '80' }} />
        </View>
        <View style={s.momentumLabels}>
          <Text style={[s.momentumLabel, { color: DS.tertiary }]}>BATTING POWER</Text>
          <Text style={[s.momentumLabel, { color: DS.secondary }]}>BOWLING PRESSURE</Text>
        </View>
      </View>
    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GENERIC SCORER — For all non-cricket sports
   Dark design, action grid with team sections
   ═══════════════════════════════════════════════════════════════ */
function GenericScorer({ match, cfg, events, period, onAdd, onUndo, saving, matchOver, winnerName, winnerReason }) {
  const DS = useScoringColors();
  const s = useScoringStyles(makeS);
  const score1 = cfg.scoreLabel(events, match?.team1Id, match?.team2Id);
  const score2 = cfg.scoreLabel(events, match?.team2Id, match?.team1Id);
  const periodEvents = events.filter(e => e.periodNum === period);

  // Per-team rosters + the currently-selected scorer — events get attributed to them.
  const [rosters, setRosters]   = useState({ team1: [], team2: [] });
  const [activeId, setActiveId] = useState({});   // { [teamId]: playerId }
  const [addFor, setAddFor]     = useState(null);  // teamId we're adding a player to
  const [newName, setNewName]   = useState('');

  useEffect(() => {
    let alive = true;
    const load = async (teamId, slot) => {
      if (!teamId) return;
      const res = await legendsApi.getPlayers({ teamId });
      if (alive && res.success) setRosters(r => ({ ...r, [slot]: res.data || [] }));
    };
    load(match?.team1Id, 'team1');
    load(match?.team2Id, 'team2');
    return () => { alive = false; };
  }, [match?.team1Id, match?.team2Id]);

  const addPlayer = async () => {
    const name = newName.trim();
    if (!name || !addFor) return;
    const res = await legendsApi.createPlayer({ name, role: 'Player', teamId: addFor });
    if (res.success && res.data) {
      const slot = addFor === match?.team1Id ? 'team1' : 'team2';
      setRosters(r => ({ ...r, [slot]: [...(r[slot] || []), res.data] }));
      setActiveId(a => ({ ...a, [addFor]: res.data.id }));
    }
    setNewName(''); setAddFor(null);
  };

  const nameFor = (teamId) => {
    const slot = teamId === match?.team1Id ? 'team1' : 'team2';
    return (rosters[slot] || []).find(p => p.id === activeId[teamId])?.name;
  };

  const PlayerStrip = ({ teamId, slot }) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.genPlayerStrip}>
      {(rosters[slot] || []).map(p => {
        const on = activeId[teamId] === p.id;
        return (
          <TouchableOpacity
            key={p.id}
            style={[s.genPlayerChip, on && { backgroundColor: cfg.color, borderColor: cfg.color }]}
            onPress={() => setActiveId(a => ({ ...a, [teamId]: on ? undefined : p.id }))}
          >
            <Text style={[s.genPlayerChipTxt, on && { color: DS.white }]} numberOfLines={1}>{p.name}</Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity style={s.genPlayerAdd} onPress={() => setAddFor(teamId)}>
        <Icon name="plus" size={13} color={DS.tertiary} />
        <Text style={s.genPlayerAddTxt}>Player</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const ActionButton = ({ action, teamId }) => (
    <TouchableOpacity
      style={s.genActionBtn}
      onPress={() => onAdd(teamId, action, activeId[teamId])}
      disabled={saving || matchOver}
      activeOpacity={0.7}
    >
      <View style={[s.genActionIcon, { backgroundColor: action.color + '20' }]}>
        <Icon name={action.icon} size={20} color={action.color} />
      </View>
      <Text style={s.genActionLabel}>{action.label}</Text>
      {action.value > 0 && (
        <View style={[s.genActionBadge, { backgroundColor: action.color }]}>
          <Text style={s.genActionBadgeText}>+{action.value}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const TeamSection = ({ teamId, slot, name }) => {
    const who = nameFor(teamId);
    return (
      <View style={s.genTeamSection}>
        <View style={s.genTeamHead}>
          <Text style={s.genSectionTitle}>{name}</Text>
          <Text style={s.genScorerHint}>{who ? `scoring: ${who}` : 'tap a player to attribute'}</Text>
        </View>
        <PlayerStrip teamId={teamId} slot={slot} />
        <View style={s.genActionGrid}>
          {cfg.actions.map(action => (
            <ActionButton key={action.type} action={action} teamId={teamId} />
          ))}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* ── Score Display ────────────────────────────── */}
      {matchOver && winnerName &&
        <View style={[s.genWinnerBanner, { backgroundColor: cfg.color }]}>
          <Icon name="trophy" size={18} color={DS.bg} />
          <Text style={s.genWinnerTxt}>{winnerName} win{winnerReason ? ` · ${winnerReason}` : ''}</Text>
        </View>
      }
      {matchOver && match?.id &&
        <MatchPhotos matchId={match.id} style={{ marginHorizontal: 16, marginTop: 12 }} />
      }
      <View style={[s.genScoreSection, { backgroundColor: cfg.color + '14', borderBottomColor: cfg.color }]}>
        <View style={s.genScoreTeam}>
          <View style={[s.genAvatar, { backgroundColor: cfg.color + '40' }]}>
            <Text style={[s.genAvatarText, { color: cfg.color }]}>
              {(match?.team1 || 'T1').charAt(0)}
            </Text>
          </View>
          <Text style={s.genTeamName} numberOfLines={1}>{match?.team1 || 'Team 1'}</Text>
          <Text style={[s.genScoreVal, { color: cfg.color }]}>{score1}</Text>
        </View>

        <View style={s.genSep}>
          <Text style={s.genVs}>VS</Text>
          <Text style={[s.genPeriodText, { color: cfg.color }]}>{cfg.periods[period - 1]}</Text>
        </View>

        <View style={s.genScoreTeam}>
          <View style={[s.genAvatar, { backgroundColor: cfg.color + '40' }]}>
            <Text style={[s.genAvatarText, { color: cfg.color }]}>
              {(match?.team2 || 'T2').charAt(0)}
            </Text>
          </View>
          <Text style={s.genTeamName} numberOfLines={1}>{match?.team2 || 'Team 2'}</Text>
          <Text style={[s.genScoreVal, { color: cfg.color }]}>{score2}</Text>
        </View>
      </View>

      <TeamSection teamId={match?.team1Id} slot="team1" name={match?.team1 || 'Team 1'} />
      <TeamSection teamId={match?.team2Id} slot="team2" name={match?.team2 || 'Team 2'} />

      {/* add-player modal */}
      <Modal visible={!!addFor} transparent animationType="fade" onRequestClose={() => setAddFor(null)}>
        <View style={s.genModalBackdrop}>
          <View style={s.genModalCard}>
            <Text style={s.genModalTitle}>Add player</Text>
            <TextInput
              style={s.genModalInput}
              placeholder="Player name"
              placeholderTextColor={DS.muted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              onSubmitEditing={addPlayer}
              returnKeyType="done"
            />
            <View style={s.genModalBtns}>
              <TouchableOpacity onPress={() => { setNewName(''); setAddFor(null); }} style={s.genModalCancel}>
                <Text style={s.genModalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addPlayer} style={[s.genModalAdd, !newName.trim() && { opacity: 0.5 }]} disabled={!newName.trim()}>
                <Text style={s.genModalAddTxt}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Period Event Log ─────────────────────────── */}
      {periodEvents.length > 0 && (
        <View style={s.genEventLog}>
          <Text style={s.genSectionTitle}>THIS PERIOD</Text>
          <View style={s.genEventBalls}>
            {periodEvents.slice(-20).map(e => {
              const action = cfg.actions.find(a => a.type === e.eventType);
              const color  = action?.color || DS.primary;
              const isT1   = e.teamId === match?.team1Id;
              return (
                <View key={e.id} style={{ alignItems: 'center', gap: 2 }}>
                  <EventBall label={e.eventType.slice(0, 3).toUpperCase()} color={color} size={30} />
                  <Text style={{ fontSize: 8, color: DS.muted, fontWeight: '600' }}>
                    {isT1 ? (match?.team1 || 'T1').slice(0, 5) : (match?.team2 || 'T2').slice(0, 5)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Score by Period ───────────────────────────── */}
      <View style={s.genTotalsCard}>
        <Text style={s.genSectionTitle}>SCORE BY PERIOD</Text>
        {cfg.periods.slice(0, cfg.maxPeriods).map((p, i) => {
          const pEvents = events.filter(e => e.periodNum === i + 1);
          const t1 = cfg.scoreLabel(pEvents, match?.team1Id, match?.team2Id);
          const t2 = cfg.scoreLabel(pEvents, match?.team2Id, match?.team1Id);
          return (
            <View key={p} style={s.genTotalsRow}>
              <Text style={s.genTotalsLabel}>{p}</Text>
              <Text style={[s.genTotalsScore, { color: cfg.color }]}>{t1}</Text>
              <Text style={s.genTotalsSep}>—</Text>
              <Text style={[s.genTotalsScore, { color: DS.secondary }]}>{t2}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN SCREEN
   ═══════════════════════════════════════════════════════════════ */
export default function SportScoringScreen({ route, navigation }) {
  const DS = useScoringColors();
  const s = useScoringStyles(makeS);
  const { isDark } = useTheme();
  const { match }  = route.params || {};
  const sport      = match?.sport || 'football';
  const cfg        = getScoringConfig(sport);
  const isCricket  = sport === 'cricket';

  const [events, setEvents]     = useState([]);
  const [period, setPeriod]     = useState(1);
  const [saving, setSaving]     = useState(false);
  const [matchOver, setMatchOver] = useState(false);

  const score1 = cfg.scoreLabel(events, match?.team1Id, match?.team2Id);
  const score2 = cfg.scoreLabel(events, match?.team2Id, match?.team1Id);

  // Winner detection — instant finishes (KO/pin/ippon, completed set-match) or score.
  const winner = useMemo(
    () => decideWinner(sport, events, match?.team1Id, match?.team2Id),
    [sport, events, match],
  );
  const winnerName = winner.side === 'team1' ? match?.team1 : winner.side === 'team2' ? match?.team2 : null;

  const finishMatch = useCallback(async (silent) => {
    if (match?.id) {
      await legendsApi.updateMatch(match.id, {
        status: 'completed', score1, score2,
        result: winnerName ? `${winnerName} won${winner.reason ? ' by ' + winner.reason : ''}` : `${score1} - ${score2}`,
      });
    }
    setMatchOver(true);
    if (!silent) {
      Alert.alert(
        'Match Complete',
        winnerName ? `${winnerName} win${winner.reason ? ` (${winner.reason})` : ''}!` : `Final: ${match?.team1} ${score1} — ${match?.team2} ${score2}`,
        [{ text: 'OK', onPress: () => navigation.navigate('Home') }],
      );
    }
  }, [match, score1, score2, winnerName, winner, navigation]);

  // Auto-end the moment the match is decided (combat finish / completed set-match).
  useEffect(() => {
    if (winner.instant && winner.side && !matchOver) finishMatch(false);
  }, [winner, matchOver, finishMatch]);

  const addEvent = useCallback(async (teamId, action, playerId) => {
    if (matchOver) return;
    setSaving(true);
    const eventData = {
      sport, teamId,
      ...(playerId ? { playerId } : {}),
      eventType: action.type,
      value:     action.value,
      period:    cfg.periods[period - 1],
      periodNum: period,
    };
    const tempEvent = { ...eventData, id: Date.now().toString(), createdAt: new Date().toISOString() };
    setEvents(prev => [...prev, tempEvent]);

    const res = await legendsApi.addSportEvent(match?.id, eventData);
    if (res.success) {
      setEvents(prev => prev.map(e => e.id === tempEvent.id ? { ...tempEvent, id: res.data?.id || tempEvent.id } : e));
    } else {
      setEvents(prev => prev.filter(e => e.id !== tempEvent.id));
      Alert.alert('Error', 'Failed to record event');
    }
    setSaving(false);
  }, [matchOver, sport, cfg, period, match]);

  const undoLast = useCallback(async () => {
    const last = events[events.length - 1];
    if (!last) return;
    setEvents(prev => prev.slice(0, -1));
    if (match?.id && last.id) {
      await legendsApi.deleteSportEvent(match.id, last.id);
    }
  }, [events, match]);

  const endMatch = useCallback(() => {
    Alert.alert('End Match', 'Are you sure you want to end this match?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Match', style: 'destructive', onPress: () => finishMatch(false) },
    ]);
  }, [finishMatch]);

  return (
    <View style={s.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />

      {/* ── Top App Bar ─────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.topBarBtn}>
          <Icon name="arrow-left" size={22} color={DS.onSurface} />
        </TouchableOpacity>
        <View style={s.topBarCenter}>
          <View style={s.topBarLogo}>
            <Icon name="star-four-points" size={14} color={DS.bg} />
          </View>
          <Text style={s.topBarTitle}>LOCAL</Text>
          <View style={s.topBarBadge}>
            <Text style={s.topBarBadgeText}>LEGENDS</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.topBarBtn} onPress={undoLast}>
            <Icon name="undo" size={18} color={DS.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity style={s.topBarBtn} onPress={endMatch}>
            <Icon name="flag-checkered" size={18} color={DS.error} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Sport + Live Pill ───────────────────────── */}
      <View style={s.sportRow}>
        <View style={[s.sportPill, { backgroundColor: cfg.color + '25' }]}>
          <Icon name={cfg.icon} size={14} color={cfg.color} />
          <Text style={[s.sportPillText, { color: cfg.color }]}>{sport.toUpperCase()}</Text>
        </View>
        <View style={s.livePill}>
          <View style={s.liveDot} />
          <Text style={s.liveText}>LIVE</Text>
        </View>
      </View>

      {/* ── Period Selector ─────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.periodBar}
        style={{ flexGrow: 0 }}
      >
        {cfg.periods.slice(0, cfg.maxPeriods).map((p, i) => (
          <TouchableOpacity
            key={p}
            style={[s.periodChip, period === i + 1 && [s.periodChipActive, { backgroundColor: cfg.color }]]}
            onPress={() => setPeriod(i + 1)}
          >
            <Text style={[s.periodChipText, period === i + 1 && s.periodChipTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Main Content ────────────────────────────── */}
      {isCricket ? (
        <CricketScorer
          match={match} cfg={cfg} events={events}
          period={period} onAdd={addEvent} onUndo={undoLast}
          saving={saving} matchOver={matchOver}
        />
      ) : (
        <GenericScorer
          match={match} cfg={cfg} events={events}
          period={period} onAdd={addEvent} onUndo={undoLast}
          saving={saving} matchOver={matchOver}
          winnerName={winnerName} winnerReason={winner.reason}
        />
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STYLES — "Kinetic Athlete" Dark Design
   ═══════════════════════════════════════════════════════════════ */
const makeS = (DS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },

  /* ── Top Bar ──────────────────────────────────────── */
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 10,
    backgroundColor: DS.cLow + 'B0',
  },
  topBarBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: DS.cHigh, alignItems: 'center', justifyContent: 'center',
  },
  topBarCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topBarLogo: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: DS.tertiary, alignItems: 'center', justifyContent: 'center',
  },
  topBarTitle: { fontSize: 16, fontWeight: '900', color: DS.onSurface, letterSpacing: 2 },
  topBarBadge: {
    backgroundColor: DS.tertiary, borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  topBarBadgeText: { fontSize: 10, fontWeight: '900', color: DS.bg, letterSpacing: 1 },

  /* ── Sport Row ────────────────────────────────────── */
  sportRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 8,
  },
  sportPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
  },
  sportPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: DS.live },
  liveText: { fontSize: 10, fontWeight: '800', color: DS.live, letterSpacing: 1 },

  /* ── Period Bar ───────────────────────────────────── */
  periodBar: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  periodChip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999,
    backgroundColor: DS.cHigh,
  },
  periodChipActive: {},
  periodChipText: { fontSize: 12, fontWeight: '700', color: DS.muted },
  periodChipTextActive: { color: DS.white },

  /* ══ CRICKET STYLES ══════════════════════════════════ */

  /* ── Jumbotron ────────────────────────────────────── */
  jumbotron: {
    marginHorizontal: 14, marginTop: 4, marginBottom: 12,
    borderRadius: 999, overflow: 'hidden',
    backgroundColor: DS.cLow,
  },
  jumbotronGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.25,
  },
  jumbotronInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingVertical: 16,
    backgroundColor: DS.cHigh, borderRadius: 999,
    margin: 3,
  },
  jumbotronLabel: {
    fontSize: 9, fontWeight: '800', color: DS.tertiary,
    letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 2,
  },
  jumbotronScore: { fontSize: 42, fontWeight: '900', color: DS.onSurface, letterSpacing: -1 },
  jumbotronOvers: { fontSize: 16, fontWeight: '700', color: DS.onVariant },
  jumbotronTargetLabel: {
    fontSize: 9, fontWeight: '800', color: DS.secondary,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  jumbotronNeed: { fontSize: 12, fontWeight: '600', color: DS.onVariant, fontStyle: 'italic', marginTop: 2 },

  /* ── Player Cards ─────────────────────────────────── */
  playerRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, marginBottom: 10 },
  playerCard: {
    flex: 1, backgroundColor: DS.cHigh, borderRadius: 14, padding: 14,
  },
  playerCardLabel: {
    fontSize: 9, fontWeight: '800', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 6,
  },
  playerCardName: { fontSize: 16, fontWeight: '800', color: DS.onSurface, marginBottom: 2 },
  playerCardSub: { fontSize: 11, color: DS.onVariant },

  /* ── Extras Bar ───────────────────────────────────── */
  extrasBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 14, marginBottom: 12,
    backgroundColor: DS.cLow, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
  },
  extrasBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: DS.cHigh, borderRadius: 12,
  },
  extrasBtnText: {
    fontSize: 9, fontWeight: '800', color: DS.onVariant, letterSpacing: 1.5,
  },

  /* ── 3x3 Scoring Grid ────────────────────────────── */
  scoringGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 14, marginBottom: 14,
  },
  gridBtn: {
    width: (W - 28 - 20) / 3, aspectRatio: 1,
    backgroundColor: DS.cHigh, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  gridBtnNum: { fontSize: 36, fontWeight: '900', color: DS.onSurface },
  gridBtnSub: {
    fontSize: 8, fontWeight: '800', color: DS.onVariant,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },

  /* ── Over Log ─────────────────────────────────────── */
  overLog: {
    marginHorizontal: 14, marginBottom: 14,
    backgroundColor: DS.cLow, borderRadius: 18, padding: 16,
  },
  overLogHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  overLogTitle: {
    fontSize: 10, fontWeight: '800', color: DS.onVariant,
    letterSpacing: 2.5, textTransform: 'uppercase',
  },
  overBalls: { flexDirection: 'row', gap: 4 },
  overBallSlot: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: DS.cHighest, borderWidth: 1, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  overBallText: { fontSize: 12, fontWeight: '800' },

  /* ── Momentum Meter ───────────────────────────────── */
  momentumTrack: {
    height: 5, width: '100%', borderRadius: 3, overflow: 'hidden',
    flexDirection: 'row', backgroundColor: DS.cHighest,
  },
  momentumFill: { height: '100%' },
  momentumLabels: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 6,
  },
  momentumLabel: {
    fontSize: 8, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase',
  },

  /* ══ GENERIC STYLES ══════════════════════════════════ */

  /* ── Score Section ────────────────────────────────── */
  genWinnerBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, marginHorizontal: 14, marginTop: 4, borderRadius: 14,
  },
  genWinnerTxt: { color: DS.bg, fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },

  genScoreSection: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 20,
    marginHorizontal: 14, marginTop: 4, marginBottom: 12,
    backgroundColor: DS.cHigh, borderRadius: 20,
    borderBottomWidth: 3, borderBottomColor: DS.cHigh,
  },
  genScoreTeam: { flex: 1, alignItems: 'center', gap: 6 },
  genAvatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  genAvatarText: { fontSize: 20, fontWeight: '900' },
  genTeamName: { fontSize: 12, fontWeight: '700', color: DS.onVariant, textAlign: 'center' },
  genScoreVal: { fontSize: 30, fontWeight: '900', color: DS.onSurface },
  genSep: { alignItems: 'center', paddingHorizontal: 10 },
  genVs: { fontSize: 12, fontWeight: '800', color: DS.dim },
  genPeriodText: { fontSize: 10, color: DS.muted, fontWeight: '600', marginTop: 4 },

  /* ── Team Sections ────────────────────────────────── */
  genTeamSection: { paddingHorizontal: 14, marginBottom: 14 },
  genTeamHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  genSectionTitle: {
    fontSize: 10, fontWeight: '800', color: DS.onVariant,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  genScorerHint: { fontSize: 10, fontWeight: '700', color: DS.tertiary },

  // player picker
  genPlayerStrip: { gap: 8, paddingBottom: 10 },
  genPlayerChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: DS.cHigh, borderWidth: 1, borderColor: DS.cHigh, maxWidth: 140,
  },
  genPlayerChipTxt: { fontSize: 12, fontWeight: '700', color: DS.onSurface },
  genPlayerAdd: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: DS.tertiary, borderStyle: 'dashed',
  },
  genPlayerAddTxt: { fontSize: 12, fontWeight: '800', color: DS.tertiary },

  // add-player modal
  genModalBackdrop: { flex: 1, backgroundColor: DS.overlay, alignItems: 'center', justifyContent: 'center', padding: 28 },
  genModalCard: { width: '100%', backgroundColor: DS.cHigh, borderRadius: 18, padding: 18 },
  genModalTitle: { fontSize: 15, fontWeight: '800', color: DS.onSurface, marginBottom: 12 },
  genModalInput: { backgroundColor: DS.cLow, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: DS.onSurface, fontSize: 15 },
  genModalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  genModalCancel: { paddingHorizontal: 16, paddingVertical: 10 },
  genModalCancelTxt: { color: DS.muted, fontSize: 14, fontWeight: '700' },
  genModalAdd: { backgroundColor: DS.tertiary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  genModalAddTxt: { color: DS.bg, fontSize: 14, fontWeight: '900' },

  genActionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.cHigh, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  genActionIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  genActionLabel: { fontSize: 13, fontWeight: '700', color: DS.onSurface },
  genActionBadge: {
    borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 'auto',
  },
  genActionBadgeText: { fontSize: 10, fontWeight: '900', color: DS.white },

  /* ── Event Log ────────────────────────────────────── */
  genEventLog: { paddingHorizontal: 14, marginBottom: 14 },
  genEventBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  /* ── Totals Card ──────────────────────────────────── */
  genTotalsCard: {
    marginHorizontal: 14, backgroundColor: DS.cHigh,
    borderRadius: 18, padding: 16, marginBottom: 14,
  },
  genTotalsRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: DS.dim + '20', gap: 8,
  },
  genTotalsLabel: { flex: 1, fontSize: 13, color: DS.onVariant, fontWeight: '600' },
  genTotalsScore: { fontSize: 15, fontWeight: '800', minWidth: 50, textAlign: 'center' },
  genTotalsSep: { fontSize: 13, color: DS.dim },

  /* ── Shared ───────────────────────────────────────── */
  ballWrap: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ballText: { fontWeight: '900' },
});
