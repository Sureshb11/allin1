import { useTheme, useThemedStyles } from "../theme/ThemeContext";import { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Modal, Share, StatusBar, Dimensions } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { haptic } from '../utils/haptics';
import { showToast } from '../components/Toast';

const { width } = Dimensions.get('window');
















export default function ScoringScreen({ route, navigation }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);const setup = useThemedStyles(makeSetup);
  const { match, resume, matchId: resumeId } = route.params || {};
  const [matchData, setMatchData] = useState(match || {});

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Scoring',
    });
  }, [navigation]);

  const [currentScore, setCurrentScore] = useState({ runs: 0, wickets: 0, overs: 0, balls: 0 });
  const [firstInningsScore, setFirstInningsScore] = useState({ runs: 0, wickets: 0, overs: 0 });
  const [striker, setStriker] = useState(null);
  const [nonStriker, setNonStriker] = useState(null);
  const [currentBowler, setCurrentBowler] = useState(null);
  const [currentOver, setCurrentOver] = useState([]);
  const [isInnings2, setIsInnings2] = useState(false);
  const [battingTeamName, setBattingTeamName] = useState('');
  const [bowlingTeamName, setBowlingTeamName] = useState('');
  const [battingXI, setBattingXI] = useState([]);
  const [bowlingXI, setBowlingXI] = useState([]);
  const [battingTeamId, setBattingTeamId] = useState('');
  const [bowlingTeamId, setBowlingTeamId] = useState('');
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showBowlerModal, setShowBowlerModal] = useState(false);
  // At over-end the bowler MUST change (no consecutive overs) → mandatory, non-
  // dismissable picker. A manual mid-over swap stays optional/cancellable.
  const [mustPickBowler, setMustPickBowler] = useState(false);
  const [matchComplete, setMatchComplete] = useState(false);
  const [matchResult, setMatchResult] = useState('');
  const [currentInningId, setCurrentInningId] = useState('');
  const [ballCount, setBallCount] = useState(0);
  const [overSummary, setOverSummary] = useState(null);
  const [scoringReady, setScoringReady] = useState(false);
  // Bowling spell tracking → per-bowler over limit + no consecutive overs.
  const [bowlerOvers, setBowlerOvers] = useState({});      // bowlerId -> overs bowled
  const [lastOverBowlerId, setLastOverBowlerId] = useState(null);
  // Real per-player figures for the live cards (not team totals):
  //   batStats:  playerId -> { runs, balls, fours, sixes }
  //   bowlStats: playerId -> { balls, runs, wickets, maidens, overRuns }
  const [batStats, setBatStats] = useState({});
  const [bowlStats, setBowlStats] = useState({});
  const [extraPrompt, setExtraPrompt] = useState(null);    // 'wide'|'noball'|'bye'|'legbye' → +runs sheet
  const [wicketPrompt, setWicketPrompt] = useState(false); // WICKET → dismissal-type sheet
  const [showSettings, setShowSettings] = useState(false); // top-bar settings sheet (End Innings/Match lives here)
  const [endPrompt, setEndPrompt] = useState(false);       // reason picker before ending innings/match
  // Undo: snapshot of everything a ball mutates, pushed before each delivery.
  const [history, setHistory] = useState([]);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    if (matchData) {
      setBattingTeamName(matchData.battingTeamName || '');
      setBowlingTeamName(matchData.bowlingTeamName || '');
      setBattingXI(matchData.battingXI || []);
      setBowlingXI(matchData.bowlingXI || []);
      setBattingTeamId(matchData.battingTeamId || '');
      setBowlingTeamId(matchData.bowlingTeamId || '');
      setCurrentInningId(matchData.firstInningId || '');
      // Do NOT auto-assign — user picks on setup screen
    }
  }, [matchData]);

  // ── Resume an in-progress match: rehydrate the full scoring state from the
  // server (Module 7 live-state projection) and skip the toss/setup screen.
  useEffect(() => {
    if (!resume || !resumeId) return;
    (async () => {
      const res = await legendsApi.getLiveState(resumeId);
      const d = res.data;
      if (!res.success || !d?.resumable) { showToast('Could not resume this match', 'error'); return; }
      setMatchData({
        id: d.matchId, overs: String(d.totalOvers), sport: 'cricket',
        battingTeamName: d.battingTeam, bowlingTeamName: d.bowlingTeam,
        battingXI: d.battingXI, bowlingXI: d.bowlingXI,
        battingTeamId: d.battingTeamId, bowlingTeamId: d.bowlingTeamId,
        firstInningId: d.inningId,
      });
      setIsInnings2(!!d.isInnings2);
      if (d.isInnings2 && d.target) setFirstInningsScore({ runs: d.target - 1, wickets: 0, overs: 0 });
      setCurrentScore({ runs: d.totalRuns, wickets: d.wickets, overs: d.completedOvers, balls: d.ballInOver });
      setBallCount(d.ballInOver || 0);
      setCurrentOver(d.currentOverBalls || []);
      setCurrentInningId(d.inningId);
      setBowlerOvers(d.bowlerOvers || {});
      setLastOverBowlerId(d.lastOverBowlerId || null);
      // Rehydrate real per-player figures so the striker/bowler cards resume with
      // correct O-M-R-W and runs(balls) — not zeros or team totals.
      setBatStats(d.battingFigures || {});
      setBowlStats(Object.fromEntries(
        Object.entries(d.bowlingFigures || {}).map(([id, f]) => [id, { ...f, overRuns: 0 }])
      ));
      // A batter is "known" only if the last ball wasn't a wicket; bowler only
      // if we're mid-over. Pre-fill what we know and, if anything's missing,
      // drop to the setup screen so the scorer re-picks (this is why batters
      // looked empty before — with no balls yet, the crease can't be recovered).
      const knownStriker = d.needsNewBatter ? null : d.striker;
      const knownBowler = d.needsNewBowler ? null : d.bowler;
      setStriker(knownStriker || null);
      setNonStriker(d.nonStriker || null);
      setCurrentBowler(knownBowler || null);
      const fullyKnown = knownStriker && d.nonStriker && knownBowler;
      setScoringReady(!!fullyKnown);
      showToast(fullyKnown ? 'Resumed scoring' : 'Resumed — confirm the players', 'success', 1600);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, resumeId]);

  // Persist the crease whenever it changes (opening pick, strike rotation, new
  // batter, new bowler) so a back-out + resume restores the exact pair/bowler and
  // never re-prompts "Select player". Only once scoring is live and the inning is known.
  useEffect(() => {
    if (!scoringReady) return;
    const mId = matchData?.id;
    if (!mId || !currentInningId) return;
    legendsApi.saveCrease(mId, {
      inningId: currentInningId,
      strikerId: striker?.id || null,
      nonStrikerId: nonStriker?.id || null,
      currentBowlerId: currentBowler?.id || null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoringReady, striker, nonStriker, currentBowler, matchData?.id, currentInningId]);

  const overStr = `${currentScore.overs}.${currentScore.balls}`;
  const totalOvers = parseInt(matchData.overs, 10) || 20;
  const maxOversPerBowler = Math.ceil(totalOvers / 5);   // T20 → 4, ODI → 10
  const target = isInnings2 ? firstInningsScore.runs + 1 : 0;
  const need = isInnings2 ? Math.max(0, target - currentScore.runs) : 0;
  const ballsLeft = isInnings2 ? Math.max(1, totalOvers * 6 - (currentScore.overs * 6 + currentScore.balls)) : 1;

  // countsAsBall=false for penalty runs — they're a team award, not a delivery,
  // so the over/ball count must not advance.
  const persistBall = async (runs, extras, extraType, isWicket, wicketType, countsAsBall = true) => {
    if (!currentInningId || !striker || !nonStriker || !currentBowler) return;
    const overNumber = currentScore.overs + 1;
    const newBallCount = countsAsBall ? ballCount + 1 : ballCount;
    if (countsAsBall) setBallCount(newBallCount);
    await legendsApi.updateScore(matchData.id, {
      inningId: currentInningId, overNumber, ballNumber: newBallCount,
      bowlerId: currentBowler.id, batterId: striker.id, nonStrikerId: nonStriker.id,
      runs, extras, extraType: extraType || null,
      isWicket, wicketType: wicketType || null,
      dismissedPlayerId: isWicket ? striker.id : null,
      // Idempotency key — if the auto-retry re-sends a ball that actually
      // landed, the server dedupes instead of double-counting.
      clientEventId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    });
  };

  const checkWinCondition = (newScore) => {
    if (!isInnings2) return false;
    if (newScore.runs >= target) {
      const wRemain = 10 - newScore.wickets;
      endMatch(`${battingTeamName} won by ${wRemain} wicket${wRemain !== 1 ? 's' : ''}`, newScore);
      return true;
    }
    if (newScore.wickets >= 10 || newScore.overs >= totalOvers && newScore.balls === 0) {
      const diff = target - 1 - newScore.runs;
      endMatch(diff === 0 ? 'Match Tied!' : `${bowlingTeamName} won by ${diff} run${diff !== 1 ? 's' : ''}`, newScore);
      return true;
    }
    return false;
  };

  const endMatch = async (result, finalScore) => {
    haptic.success();   // celebratory buzz on the winning moment
    setMatchComplete(true);
    setMatchResult(result);
    const scoreStr = `${finalScore.runs}/${finalScore.wickets} (${finalScore.overs}.${finalScore.balls})`;
    await legendsApi.updateMatch(matchData.id, { status: 'completed', score2: scoreStr, result });
    Alert.alert('Match Complete!', result);
  };

  // Undo the last delivery: restore the pre-ball snapshot and delete the ball
  // server-side. Works across over boundaries because the snapshot captures the
  // full state, not a diff.
  const undoLastBall = async () => {
    if (matchComplete || undoing || history.length === 0) return;
    setUndoing(true);
    haptic.tick();
    const prev = history[history.length - 1];
    const res = await legendsApi.undoLastBall(matchData.id, currentInningId);
    if (!res.success) {
      showToast(res.error || 'Could not undo', 'error');
      setUndoing(false);
      return;
    }
    setHistory((h) => h.slice(0, -1));
    setCurrentScore(prev.score);
    setCurrentOver(prev.over);
    setBallCount(prev.ballCount);
    setStriker(prev.striker);
    setNonStriker(prev.nonStriker);
    setCurrentBowler(prev.bowler);
    if (prev.batStats) setBatStats(prev.batStats);
    if (prev.bowlStats) setBowlStats(prev.bowlStats);
    setOverSummary(null);
    setShowPlayerModal(false);
    setShowBowlerModal(false);
    const s = `${prev.score.runs}/${prev.score.wickets} (${prev.score.overs}.${prev.score.balls})`;
    if (!isInnings2) legendsApi.updateMatch(matchData.id, { score1: s });
    showToast('Last ball undone', 'success');
    setUndoing(false);
  };

  // addRuns = extra runs on a wide/no-ball/bye/leg-bye (e.g. wide+2, no-ball+4).
  // wicketType = dismissal kind chosen from the Wicket sheet.
  const handleScore = async (value, addRuns = 0, wicketType = 'bowled') => {
    if (matchComplete || undoing) return;
    // Snapshot the pre-ball state so this delivery can be taken back.
    setHistory((h) => [...h.slice(-49), {
      score: { ...currentScore }, over: [...currentOver], ballCount,
      striker, nonStriker, bowler: currentBowler,
      batStats: { ...batStats }, bowlStats: { ...bowlStats },
    }]);
    // Tactile feedback: a firm buzz on a wicket, a light tick on every other ball.
    if (value === 'out') haptic.warn(); else haptic.tick();
    let newScore = { ...currentScore };
    let newOver = [...currentOver];
    const rotate = (n) => { if (n % 2 === 1) { const t = striker; setStriker(nonStriker); setNonStriker(t); } };

    if (typeof value === 'number') {
      newScore.runs += value;
      newScore.balls += 1;
      newOver.push(value === 0 ? '·' : String(value));
      await persistBall(value, 0, null, false, null);
      rotate(value);
    } else if (value === 'wide') {
      const tot = 1 + addRuns;                    // wide penalty + runs run
      newScore.runs += tot;
      newOver.push(addRuns ? `${tot}wd` : 'WD');
      await persistBall(0, tot, 'wide', false, null);
      rotate(addRuns);
    } else if (value === 'noball') {
      newScore.runs += 1 + addRuns;               // 1 no-ball extra + runs off the bat
      newOver.push(addRuns ? `${1 + addRuns}nb` : 'NB');
      await persistBall(addRuns, 1, 'noBall', false, null);
      rotate(addRuns);
    } else if (value === 'bye') {
      const n = addRuns || 1;
      newScore.runs += n;
      newScore.balls += 1;
      newOver.push(n > 1 ? `${n}b` : 'B');
      await persistBall(0, n, 'bye', false, null);
      rotate(n);
    } else if (value === 'legbye') {
      const n = addRuns || 1;
      newScore.runs += n;
      newScore.balls += 1;
      newOver.push(n > 1 ? `${n}lb` : 'LB');
      await persistBall(0, n, 'legBye', false, null);
      rotate(n);
    } else if (value === 'out') {
      newScore.wickets += 1;
      newScore.balls += 1;
      newOver.push('W');
      await persistBall(0, 0, null, true, wicketType);
      if (newScore.wickets < 10) setShowPlayerModal(true);
    } else if (value === 'penalty') {
      // Penalty runs (5) — a team award, not a delivery: no ball faced, no
      // strike change, doesn't advance the over.
      newScore.runs += 5;
      newOver.push('P5');
      await persistBall(0, 5, 'penalty', false, null, false);
    }

    // ── Real per-player figures (striker runs/balls, bowler O-M-R-W) ──
    // Runs off the bat go to the striker; runs "charged" to the bowler are bat
    // runs + wides + no-ball penalty (byes/leg-byes/penalty are NOT charged).
    {
      let batRuns = 0, batFaced = 0, isFour = 0, isSix = 0, charged = 0, tookWkt = 0;
      const bowlerLegal = typeof value === 'number' || value === 'bye' || value === 'legbye' || value === 'out';
      if (typeof value === 'number') { batRuns = value; batFaced = 1; isFour = value === 4 ? 1 : 0; isSix = value === 6 ? 1 : 0; charged = value; }
      else if (value === 'wide') { charged = 1 + addRuns; }
      else if (value === 'noball') { batRuns = addRuns; batFaced = 1; charged = 1 + addRuns; }
      else if (value === 'bye' || value === 'legbye') { batFaced = 1; }
      else if (value === 'out') {
        batFaced = 1;
        const wt = String(wicketType).toLowerCase().replace(/\s/g, '');
        tookWkt = (wt === 'runout' || wt === 'retired') ? 0 : 1;   // run-outs aren't credited to the bowler
      }
      // 'penalty' → no batsman/bowler effect
      if (striker) setBatStats((prev) => {
        const c = prev[striker.id] || { runs: 0, balls: 0, fours: 0, sixes: 0 };
        return { ...prev, [striker.id]: { runs: c.runs + batRuns, balls: c.balls + batFaced, fours: c.fours + isFour, sixes: c.sixes + isSix } };
      });
      if (currentBowler) setBowlStats((prev) => {
        const c = prev[currentBowler.id] || { balls: 0, runs: 0, wickets: 0, maidens: 0, overRuns: 0 };
        return { ...prev, [currentBowler.id]: {
          balls: c.balls + (bowlerLegal ? 1 : 0), runs: c.runs + charged,
          wickets: c.wickets + tookWkt, maidens: c.maidens, overRuns: c.overRuns + charged,
        } };
      });
    }

    if (newScore.balls >= 6) {
      // Build over summary before reset
      const isExtra = (b) => /wd|nb|^b$|lb|WD|NB|LB|P5/i.test(b) || b === 'B';
      const overRuns = newOver.reduce((acc, b) => {
        if (b === 'WD' || b === 'NB' || b === 'B' || b === 'LB') return acc + 1;
        if (b === 'P5') return acc + 5;
        if (b === '·') return acc;
        const n = parseInt(b);                    // '2wd','3nb','2b','3lb', or plain runs
        return isNaN(n) ? acc : acc + n;
      }, 0);
      const overWickets = newOver.filter((b) => b === 'W').length;
      const overExtras = newOver.filter(isExtra).length;
      setOverSummary({
        overNum: newScore.overs + 1,
        runs: overRuns,
        wickets: overWickets,
        extras: overExtras,
        bowler: currentBowler?.name || '',
        balls: [...newOver]
      });

      newScore.overs += 1;
      newScore.balls = 0;
      setCurrentOver([]);
      setBallCount(0);
      // Credit the completed over to the bowler (spell limit) + remember them
      // so they can't bowl the next over (no consecutive overs).
      if (currentBowler) {
        setBowlerOvers((prev) => ({ ...prev, [currentBowler.id]: (prev[currentBowler.id] || 0) + 1 }));
        setLastOverBowlerId(currentBowler.id);
        // Maiden = 0 runs charged to the bowler this over; then reset the tally.
        setBowlStats((prev) => {
          const c = prev[currentBowler.id];
          if (!c) return prev;
          return { ...prev, [currentBowler.id]: { ...c, maidens: c.maidens + (c.overRuns === 0 ? 1 : 0), overRuns: 0 } };
        });
      }
      const t = striker;setStriker(nonStriker);setNonStriker(t);
      if (newScore.overs < totalOvers && newScore.wickets < 10) { setMustPickBowler(true); setShowBowlerModal(true); }
    } else {
      setCurrentOver(newOver);
    }

    setCurrentScore(newScore);
    const scoreStr = `${newScore.runs}/${newScore.wickets} (${newScore.overs}.${newScore.balls})`;
    if (!isInnings2) legendsApi.updateMatch(matchData.id, { score1: scoreStr });
    if (isInnings2) checkWinCondition(newScore);
    if (!isInnings2 && (newScore.wickets >= 10 || newScore.overs >= totalOvers && newScore.balls === 0)) {
      finishInnings(newScore.wickets >= 10 ? 'All out' : 'Overs completed', newScore);
    }
  };

  // Reasons offered before ending — an innings mid-way vs. the whole match.
  const END_REASONS = {
    innings: ['All out', 'Overs completed', 'Declared', 'Rain / interruption'],
    match:   ['Target achieved', 'All out', 'Overs completed', 'Rain / abandoned', 'Match conceded'],
  };

  // End the current innings/match with a recorded reason. `scoreOverride` lets an
  // automatic end (all-out / overs-done) pass the just-computed score.
  const finishInnings = async (reason, scoreOverride) => {
    const score = scoreOverride || currentScore;
    if (!isInnings2) {
      setFirstInningsScore(score);
      const s1 = `${score.runs}/${score.wickets} (${score.overs}.${score.balls})`;
      await legendsApi.updateMatch(matchData.id, { score1: s1 });
      const inn = await legendsApi.createInning(matchData.id, {
        battingTeamId: bowlingTeamId, bowlingTeamId: battingTeamId, targetScore: score.runs + 1,
      });
      setIsInnings2(true);
      setCurrentInningId(inn.success ? inn.data.id : '');
      setCurrentScore({ runs: 0, wickets: 0, overs: 0, balls: 0 });
      setCurrentOver([]); setBallCount(0); setOverSummary(null); setHistory([]);
      // Fresh innings → reset per-player figures + bowling spell tracking.
      setBatStats({}); setBowlStats({}); setBowlerOvers({}); setLastOverBowlerId(null);
      setBattingTeamName(bowlingTeamName); setBowlingTeamName(battingTeamName);
      setBattingXI(bowlingXI); setBowlingXI(battingXI);
      setBattingTeamId(bowlingTeamId); setBowlingTeamId(battingTeamId);
      setStriker(null); setNonStriker(null); setCurrentBowler(null);
      setScoringReady(false);
      showToast(`1st innings ended · ${reason}`, 'success');
    } else {
      let result;
      if (reason === 'Match conceded') result = `${bowlingTeamName} won — ${battingTeamName} conceded`;
      else if (reason === 'Rain / abandoned') result = 'Match abandoned · no result';
      else if (score.runs >= target) {
        const wr = 10 - score.wickets;
        result = `${battingTeamName} won by ${wr} wicket${wr !== 1 ? 's' : ''}`;
      } else {
        const diff = target - 1 - score.runs;
        result = diff === 0 ? 'Match Tied!' : `${bowlingTeamName} won by ${diff} run${diff !== 1 ? 's' : ''}`;
      }
      endMatch(result, score);
    }
  };

  const getAvailableBatsmen = () => {
    const used = [striker?.name, nonStriker?.name].filter(Boolean);
    return battingXI.filter((p) => !used.includes(p.name));
  };

  const shareScore = async () => {
    const msg = `${battingTeamName} ${currentScore.runs}/${currentScore.wickets} (${overStr}) — scoring live on Local Legends!`;
    await Share.share({ message: msg });
  };

  // Ball display in over tracker
  const renderBallDot = (b, i) => {
    let bg = DS.surfaceHighest;
    let color = DS.textPrimary;
    let label = b;
    if (b === 'W') {bg = DS.wicketBg;color = DS.wicketText;}
    if (b === 'WD') {bg = 'rgba(255,181,158,0.15)';color = DS.coral;}
    if (b === 'NB') {bg = 'rgba(255,181,158,0.15)';color = DS.coral;}
    if (b === '4') {bg = 'rgba(59,91,219,0.2)';color = DS.blue + 'ff';}
    if (b === '6') {bg = 'rgba(171,214,0,0.15)';color = DS.lime;}
    if (b === '·') {bg = DS.surfaceHighest;color = DS.textMuted;}
    return (
      <View key={i} style={[styles.overBall, { backgroundColor: bg }]}>
        <Text style={[styles.overBallText, { color }]}>{label}</Text>
      </View>);

  };

  // Fill remaining balls as empty dots
  const filledOver = [...currentOver];
  while (filledOver.length < 6) filledOver.push(null);

  // Real bowler figures: Overs - Maidens - Runs - Wickets (O-M-R-W).
  const bowlerStats = (() => {
    if (!currentBowler) return '—';
    const b = bowlStats[currentBowler.id] || { balls: 0, runs: 0, wickets: 0, maidens: 0 };
    return `${Math.floor(b.balls / 6)}.${b.balls % 6} - ${b.maidens} - ${b.runs} - ${b.wickets}`;
  })();

  // ── PRE-SCORING SETUP SCREEN ──────────────────────────────────
  if (!scoringReady) {
    const canStart = striker && nonStriker && currentBowler;

    const PlayerPickRow = ({ label, selected, onPick, players, exclude }) => {
      const available = players.filter((p) => p.name !== exclude?.name);
      return (
        <View style={setup.section}>
          <Text style={setup.sectionLabel}>{label}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={setup.playerRow}>
            {available.map((p, i) => {
              const active = selected?.name === p.name;
              return (
                <TouchableOpacity key={i} style={[setup.playerChip, active && setup.playerChipActive]} onPress={() => onPick(p)}>
                  <View style={[setup.chipAvatar, { backgroundColor: active ? DS.lime : DS.surfaceHighest }]}>
                    <Text style={[setup.chipInitial, { color: active ? DS.bg : DS.textMuted }]}>
                      {p.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[setup.chipName, active && { color: DS.lime, fontWeight: '700' }]} numberOfLines={2}>
                    {p.name}
                  </Text>
                  {active && <Icon name="check-circle" size={14} color={DS.lime} />}
                </TouchableOpacity>);

            })}
          </ScrollView>
        </View>);

    };

    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

        {/* Header */}
        <View style={setup.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={setup.backBtn}>
            <Icon name="arrow-left" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
          <View>
            <Text style={setup.headerTitle}>SELECT PLAYERS</Text>
            <Text style={setup.headerSub}>{battingTeamName} vs {bowlingTeamName}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={setup.body}>
          {/* Innings banner */}
          <View style={setup.inningsBanner}>
            <Icon name="cricket" size={16} color={DS.lime} />
            <Text style={setup.inningsText}>
              {battingTeamName || 'Batting Team'} — {isInnings2 ? '2nd Innings' : '1st Innings'}
            </Text>
          </View>

          {/* Striker */}
          <PlayerPickRow
            label="STRIKER (OPENING BATTER)"
            selected={striker}
            onPick={(p) => {
              setStriker(p);
              if (nonStriker?.name === p.name) setNonStriker(null);
            }}
            players={battingXI}
            exclude={nonStriker} />
          

          {/* Non-striker */}
          <PlayerPickRow
            label="NON-STRIKER"
            selected={nonStriker}
            onPick={(p) => {
              setNonStriker(p);
              if (striker?.name === p.name) setStriker(null);
            }}
            players={battingXI}
            exclude={striker} />
          

          {/* Bowler */}
          <PlayerPickRow
            label="OPENING BOWLER"
            selected={currentBowler}
            onPick={setCurrentBowler}
            players={bowlingXI}
            exclude={null} />
          

          {/* Summary */}
          {canStart &&
          <View style={setup.summary}>
              <View style={setup.summaryRow}>
                <Icon name="crosshairs-gps" size={14} color={DS.lime} />
                <Text style={setup.summaryText}><Text style={{ color: DS.lime }}>Striker:</Text> {striker.name}</Text>
              </View>
              <View style={setup.summaryRow}>
                <Icon name="account" size={14} color={DS.textMuted} />
                <Text style={setup.summaryText}><Text style={{ color: DS.textVariant }}>Non-striker:</Text> {nonStriker.name}</Text>
              </View>
              <View style={setup.summaryRow}>
                <Icon name="weather-windy" size={14} color={DS.coral} />
                <Text style={setup.summaryText}><Text style={{ color: DS.coral }}>Bowler:</Text> {currentBowler.name}</Text>
              </View>
            </View>
          }

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Start Scoring CTA */}
        <View style={setup.footer}>
          <TouchableOpacity
            style={[setup.startBtn, !canStart && setup.startBtnDisabled]}
            onPress={() => canStart && setScoringReady(true)}
            disabled={!canStart}>
            
            <Icon name="play-circle" size={22} color={canStart ? DS.onBlue : DS.textMuted} />
            <Text style={[setup.startBtnText, !canStart && { color: DS.textMuted }]}>
              START SCORING
            </Text>
          </TouchableOpacity>
          {!canStart &&
          <Text style={setup.hintText}>Select striker, non-striker and bowler to continue</Text>
          }
        </View>
      </View>);

  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

      {/* ── TOP BAR ── */}
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <View style={styles.brandStar}>
            <Icon name="star" size={14} color={DS.bg} />
          </View>
          <Text style={styles.brandLocal}>LOCAL</Text>
          <View style={styles.brandBadge}><Text style={styles.brandLegends}>LEGENDS</Text></View>
        </View>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.topBarBtn} onPress={shareScore}>
            <Icon name="history" size={20} color={DS.textVariant} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBarBtn} onPress={() => setShowSettings(true)}>
            <Icon name="cog-outline" size={20} color={DS.textVariant} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>

        {/* ── SCORE CARD ── */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreLeft}>
            <Text style={styles.scoreLabel}>CURRENT SCORE</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreMain}>{currentScore.runs}/{currentScore.wickets}</Text>
              <Text style={styles.scoreOvers}> ({overStr})</Text>
            </View>
            {matchComplete &&
            <View style={styles.resultPill}>
                <Text style={styles.resultText}>{matchResult}</Text>
              </View>
            }
          </View>
          {isInnings2 &&
          <View style={styles.scoreRight}>
              <Text style={styles.targetLabel}>TARGET:</Text>
              <Text style={styles.targetVal}>{target}</Text>
              <Text style={styles.needText}>Need {need} from{'\n'}{ballsLeft} balls</Text>
            </View>
          }
        </View>

        {/* ── CURRENT OVER TRACKER (compact) ── */}
        <View style={styles.overSection}>
          <Text style={styles.overSectionLabel}>THIS OVER</Text>
          <View style={styles.overBalls}>
            {filledOver.map((b, i) =>
            b !== null ? renderBallDot(b, i) :
            <View key={i} style={[styles.overBall, styles.overBallEmpty]}><View style={styles.overBallDot} /></View>
            )}
          </View>
        </View>

        {/* ── STRIKER / BOWLER ── */}
        <View style={styles.playersRow}>
          {/* Striker */}
          <View style={styles.strikerCard}>
            <View style={styles.playerCardTop}>
              <Text style={styles.strikerLabel}>STRIKER</Text>
              <TouchableOpacity onPress={() => {const t = striker;setStriker(nonStriker);setNonStriker(t);}}>
                <Icon name="swap-horizontal" size={16} color={DS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.strikerName} numberOfLines={2}>{striker?.name || 'Select Batter'}</Text>
            <View style={styles.strikerBottom}>
              <Text style={styles.strikerStats}>
                {striker ? (() => {
                  const st = batStats[striker.id] || { runs: 0, balls: 0, fours: 0, sixes: 0 };
                  return `${st.runs}(${st.balls}) • ${st.fours}x4, ${st.sixes}x6`;
                })() : '—'}
              </Text>
              <TouchableOpacity onPress={() => setShowPlayerModal(true)} style={styles.searchBtn}>
                <Icon name="account-search" size={18} color={DS.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Bowler */}
          <View style={styles.bowlerCard}>
            <View style={styles.playerCardTop}>
              <View style={styles.bowlerIconCircle}>
                <Icon name="cricket" size={14} color={DS.textMuted} />
              </View>
              <Text style={styles.bowlerLabel}>BOWLING</Text>
            </View>
            <TouchableOpacity onPress={() => { setMustPickBowler(false); setShowBowlerModal(true); }} style={styles.bowlerSwap}>
              <Icon name="swap-horizontal" size={16} color={DS.textMuted} />
            </TouchableOpacity>
            <Text style={styles.bowlerName} numberOfLines={1}>{currentBowler?.name || 'Select'}</Text>
            <Text style={styles.bowlerStats}>{bowlerStats}</Text>
          </View>
        </View>

        {/* ── EXTRAS ROW — tap for +runs (wide 2, no-ball 4, etc.) ── */}
        {!matchComplete &&
        <View style={styles.extraRow}>
            <TouchableOpacity
              style={[styles.extraBtn, (history.length === 0 || undoing) && { opacity: 0.4 }]}
              onPress={undoLastBall} disabled={history.length === 0 || undoing}>
              <Icon name="undo" size={14} color={DS.textMuted} />
              <Text style={styles.extraBtnText}>UNDO</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extraBtn} onPress={() => setExtraPrompt('wide')}>
              <Text style={[styles.extraBtnText, { color: DS.coral }]}>WD +</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extraBtn} onPress={() => setExtraPrompt('noball')}>
              <Text style={[styles.extraBtnText, { color: DS.coral }]}>NB +</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extraBtn} onPress={() => setExtraPrompt('bye')}>
              <Text style={styles.extraBtnText}>BYE +</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extraBtn} onPress={() => setExtraPrompt('legbye')}>
              <Text style={styles.extraBtnText}>LB +</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extraBtn} onPress={() => handleScore('penalty')}>
              <Text style={styles.extraBtnText}>PEN 5</Text>
            </TouchableOpacity>
          </View>
        }

        {/* ── RUNS GRID (0-6) — flexes to fill ── */}
        {!matchComplete &&
        <View style={styles.grid}>
            <View style={styles.gridRow}>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnDot]} onPress={() => handleScore(0)}>
                <Text style={styles.gridBtnNum}>0</Text><Text style={styles.gridBtnLabel}>DOT</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnDot]} onPress={() => handleScore(1)}>
                <Text style={styles.gridBtnNum}>1</Text><Text style={styles.gridBtnLabel}>SINGLE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnDot]} onPress={() => handleScore(2)}>
                <Text style={styles.gridBtnNum}>2</Text><Text style={styles.gridBtnLabel}>DOUBLE</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.gridRow}>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnDot]} onPress={() => handleScore(3)}>
                <Text style={styles.gridBtnNum}>3</Text><Text style={styles.gridBtnLabel}>TRIPLE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnFour]} onPress={() => handleScore(4)}>
                <Text style={[styles.gridBtnNum, { color: '#fff' }]}>4</Text><Text style={[styles.gridBtnLabel, { color: 'rgba(255,255,255,0.7)' }]}>FOUR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnSix]} onPress={() => handleScore(6)}>
                <Text style={[styles.gridBtnNum, { color: DS.lime }]}>6</Text><Text style={[styles.gridBtnLabel, { color: DS.lime }]}>SIX</Text>
              </TouchableOpacity>
            </View>
          </View>
        }

        {/* ── WICKET — full width, always visible; asks the dismissal type ── */}
        {!matchComplete &&
        <TouchableOpacity style={styles.wicketBtn} onPress={() => setWicketPrompt(true)}>
          <Icon name="alert-octagon" size={20} color={DS.wicketText} />
          <Text style={styles.wicketBtnText}>WICKET</Text>
        </TouchableOpacity>
        }

        {/* ── OVER SUMMARY + COMPLETE OVER ── */}
        {overSummary &&
        <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Over {overSummary.overNum} Summary</Text>
              <Text style={styles.summaryBowler}>Bowler: {overSummary.bowler} yielded {overSummary.runs} runs.</Text>
              <View style={styles.summaryStats}>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryStatLabel}>RUNS</Text>
                  <Text style={styles.summaryStatVal}>{overSummary.runs}</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryStatLabel}>WICKETS</Text>
                  <Text style={styles.summaryStatVal}>{overSummary.wickets}</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryStatLabel}>EXTRAS</Text>
                  <Text style={styles.summaryStatVal}>{overSummary.extras}</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.completeOverBtn} onPress={() => {setOverSummary(null);setMustPickBowler(true);setShowBowlerModal(true);}}>
              <Icon name="check-circle" size={28} color={DS.bg} />
              <Text style={styles.completeOverText}>COMPLETE{'\n'}OVER</Text>
            </TouchableOpacity>
          </View>
        }

        {/* END INNINGS / MATCH now lives in the ⚙ settings sheet (top-right),
            gated behind a reason picker. */}

        {/* ── MATCH COMPLETE ACTIONS ── */}
        {matchComplete &&
        <View style={styles.completeActions}>
            <TouchableOpacity
            style={[styles.completeBtn, { backgroundColor: DS.blueDeep }]}
            onPress={() => navigation.navigate('Scorecard', { matchId: matchData.id })}>

              <Icon name="clipboard-list-outline" size={18} color={DS.onBlue} />
              <Text style={[styles.completeBtnText, { color: DS.onBlue }]}>VIEW SCORECARD</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.completeBtn, { backgroundColor: '#25D366' }]} onPress={shareScore}>
              <Icon name="whatsapp" size={18} color="#fff" />
              <Text style={[styles.completeBtnText, { color: '#fff' }]}>SHARE SCORE</Text>
            </TouchableOpacity>
          </View>
        }

      </View>

      {/* ── BOTTOM TAB BAR ── */}
      <View style={styles.tabBar}>
        {[
        { icon: 'home-variant', label: 'HOME', onPress: () => navigation.navigate('HomeTab') },
        { icon: 'cricket', label: 'MATCHES', onPress: () => navigation.navigate('MyMatches') },
        { icon: 'scoreboard-outline', label: 'SCORER', active: true, onPress: () => {} },
        { icon: 'account', label: 'PROFILE', onPress: () => navigation.navigate('Profile') }].
        map((tab, i) =>
        <TouchableOpacity key={i} style={styles.tabItem} onPress={tab.onPress}>
            <Icon name={tab.icon} size={22} color={tab.active ? DS.lime : DS.textMuted} />
            <Text style={[styles.tabLabel, tab.active && { color: DS.lime }]}>{tab.label}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── PLAYER MODAL ── */}
      <Modal visible={showPlayerModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select New Batsman</Text>
            <ScrollView>
              {getAvailableBatsmen().map((p, i) =>
              <TouchableOpacity key={i} style={styles.playerOption}
              onPress={() => {setStriker(p);setShowPlayerModal(false);}}>
                  <View style={styles.playerAvatar}>
                    <Text style={styles.playerInitial}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.playerName}>{p.name}</Text>
                  <Icon name="chevron-right" size={18} color={DS.textMuted} />
                </TouchableOpacity>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowPlayerModal(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── BOWLER MODAL ── */}
      <Modal visible={showBowlerModal} transparent animationType="slide"
        onRequestClose={() => { if (!mustPickBowler) setShowBowlerModal(false); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{mustPickBowler ? 'Next Over — Pick Bowler' : 'Change Bowler'}</Text>
            <Text style={styles.modalSub}>
              Max {maxOversPerBowler} overs each · can’t bowl consecutive overs
              {mustPickBowler ? ' · a different bowler must start this over' : ''}
            </Text>
            <ScrollView>
              {bowlingXI.map((p, i) => {
                const bowled = bowlerOvers[p.id] || 0;
                const atMax = bowled >= maxOversPerBowler;
                const justBowled = p.id === lastOverBowlerId;
                const blocked = atMax || justBowled;
                const reason = atMax ? `${bowled}/${maxOversPerBowler} ov · maxed` : justBowled ? 'bowled last over' : `${bowled}/${maxOversPerBowler} ov`;
                return (
                  <TouchableOpacity key={i} style={[styles.playerOption, blocked && { opacity: 0.4 }]}
                    disabled={blocked}
                    onPress={() => { setCurrentBowler(p); setShowBowlerModal(false); setMustPickBowler(false); }}>
                    <View style={[styles.playerAvatar, { backgroundColor: DS.lime + '33' }]}>
                      <Text style={[styles.playerInitial, { color: DS.lime }]}>{p.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.playerName, { flex: 1 }]}>{p.name}</Text>
                    <Text style={[styles.modalSub, { marginBottom: 0 }]}>{reason}</Text>
                    {!blocked && <Icon name="chevron-right" size={18} color={DS.textMuted} />}
                  </TouchableOpacity>);
              })}
            </ScrollView>
            {!mustPickBowler && (
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowBowlerModal(false)}>
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ── EXTRA + RUNS sheet (wide/no-ball/bye/leg-bye + runs run) ── */}
      <Modal visible={!!extraPrompt} transparent animationType="slide" onRequestClose={() => setExtraPrompt(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {extraPrompt === 'wide' ? 'Wide' : extraPrompt === 'noball' ? 'No Ball' : extraPrompt === 'bye' ? 'Byes' : 'Leg Byes'} + runs
            </Text>
            <Text style={styles.modalSub}>
              {extraPrompt === 'wide' || extraPrompt === 'noball' ? 'Extra + any runs the batters ran' : 'How many runs were run'}
            </Text>
            <View style={styles.runChips}>
              {(extraPrompt === 'bye' || extraPrompt === 'legbye' ? [1, 2, 3, 4] : [0, 1, 2, 4]).map((n) => (
                <TouchableOpacity key={n} style={styles.runChip}
                  onPress={() => { const t = extraPrompt; setExtraPrompt(null); handleScore(t, n); }}>
                  <Text style={styles.runChipNum}>+{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setExtraPrompt(null)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── WICKET TYPE sheet — chip grid, same style as the extras +runs popup ── */}
      <Modal visible={wicketPrompt} transparent animationType="slide" onRequestClose={() => setWicketPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>How was the batter out?</Text>
            <Text style={styles.modalSub}>Tap the dismissal type</Text>
            <View style={styles.wktChips}>
              {[
                ['bowled', 'cricket'], ['caught', 'hand-back-right'], ['lbw', 'target'],
                ['run out', 'run-fast'], ['stumped', 'hand-back-left'], ['hit wicket', 'alert'],
              ].map(([type, icon]) => (
                <TouchableOpacity key={type} style={styles.wktChip}
                  onPress={() => { setWicketPrompt(false); handleScore('out', 0, type.replace(' ', '')); }}>
                  <Icon name={icon} size={22} color={DS.wicketText} />
                  <Text style={styles.wktChipText}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setWicketPrompt(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MATCH SETTINGS sheet (⚙) — End Innings/Match lives here ── */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Match Settings</Text>
            <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); shareScore(); }}>
              <Icon name="share-variant" size={20} color={DS.textPrimary} />
              <Text style={styles.settingText}>Share score</Text>
              <Icon name="chevron-right" size={18} color={DS.textMuted} />
            </TouchableOpacity>
            {!matchComplete && (
              <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); setEndPrompt(true); }}>
                <Icon name="flag-checkered" size={20} color={DS.wicketText} />
                <Text style={[styles.settingText, { color: DS.wicketText }]}>
                  {isInnings2 ? 'End match' : 'End innings'}
                </Text>
                <Icon name="chevron-right" size={18} color={DS.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowSettings(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── END REASON picker — confirm why the innings/match is ending ── */}
      <Modal visible={endPrompt} transparent animationType="slide" onRequestClose={() => setEndPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{isInnings2 ? 'End Match' : 'End Innings'} — reason</Text>
            <Text style={styles.modalSub}>Pick a reason to confirm</Text>
            {(isInnings2 ? END_REASONS.match : END_REASONS.innings).map((reason) => (
              <TouchableOpacity key={reason} style={styles.settingRow}
                onPress={() => { setEndPrompt(false); finishInnings(reason); }}>
                <Icon name="flag-outline" size={18} color={DS.coral} />
                <Text style={[styles.settingText, { flex: 1 }]}>{reason}</Text>
                <Icon name="chevron-right" size={18} color={DS.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalClose} onPress={() => setEndPrompt(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>);

}

const GRID_BTN = (width - 48) / 3;

const makeStyles = (DS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },
  // No-scroll: the content column fills the space between top bar and tab bar;
  // the scoring grid flexes to take whatever's left.
  body: { flex: 1, paddingTop: 4 },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 44, paddingBottom: 8, paddingHorizontal: 16, backgroundColor: DS.bg
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandStar: { width: 28, height: 28, borderRadius: 6, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center' },
  brandLocal: { fontSize: 16, fontWeight: '900', color: DS.textPrimary, letterSpacing: 1 },
  brandBadge: { backgroundColor: DS.lime, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  brandLegends: { fontSize: 13, fontWeight: '900', color: DS.bg, letterSpacing: 1 },
  topBarRight: { flexDirection: 'row', gap: 8 },
  topBarBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center' },

  // Score card
  scoreCard: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    backgroundColor: DS.surfaceHigh, marginHorizontal: 16, borderRadius: 16, padding: 12, marginBottom: 8
  },
  scoreLeft: { flex: 1 },
  scoreLabel: { fontSize: 11, fontWeight: '700', color: DS.lime, letterSpacing: 1.5, marginBottom: 2 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end' },
  scoreMain: { fontSize: 40, fontWeight: '900', color: DS.textPrimary, letterSpacing: -2, lineHeight: 44 },
  scoreOvers: { fontSize: 18, color: DS.textMuted, fontWeight: '600', marginBottom: 6 },
  scoreRight: { alignItems: 'flex-end' },
  targetLabel: { fontSize: 11, fontWeight: '700', color: DS.coral, letterSpacing: 1 },
  targetVal: { fontSize: 28, fontWeight: '900', color: DS.coral },
  needText: { fontSize: 13, color: DS.coral, textAlign: 'right', lineHeight: 18, marginTop: 2 },
  resultPill: { marginTop: 8, backgroundColor: DS.lime, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3, alignSelf: 'flex-start' },
  resultText: { fontSize: 12, fontWeight: '700', color: DS.bg },

  // Players row
  playersRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 8 },
  strikerCard: {
    flex: 1.1, backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 10,
    borderLeftWidth: 3, borderLeftColor: DS.lime
  },
  bowlerCard: {
    flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 10,
    borderLeftWidth: 3, borderLeftColor: DS.surfaceHighest
  },
  playerCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  strikerLabel: { fontSize: 10, fontWeight: '700', color: DS.lime, letterSpacing: 1.2 },
  strikerName: { fontSize: 16, fontWeight: '900', color: DS.textPrimary, lineHeight: 20, marginBottom: 4 },
  strikerBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  strikerStats: { fontSize: 11, color: DS.textMuted, flex: 1 },
  searchBtn: { padding: 4 },
  bowlerIconCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  bowlerLabel: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 1.2 },
  bowlerSwap: { alignSelf: 'flex-start', marginBottom: 4 },
  bowlerName: { fontSize: 16, fontWeight: '800', color: DS.textPrimary, marginBottom: 4 },
  bowlerStats: { fontSize: 11, color: DS.textMuted },

  // Extra action row
  extraRow: { flexDirection: 'row', gap: 6, marginHorizontal: 16, marginBottom: 8 },
  extraBtn: {
    flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center', gap: 2
  },
  extraBtnText: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.3, textAlign: 'center' },

  // Full-width wicket button
  wicketBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8, backgroundColor: DS.wicketBg, borderRadius: 14, paddingVertical: 14,
  },
  wicketBtnText: { fontSize: 15, fontWeight: '900', color: DS.wicketText, letterSpacing: 2 },

  // Run chips (extra + runs sheet)
  runChips: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  runChip: { flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  runChipNum: { fontSize: 24, fontWeight: '900', color: DS.textPrimary },

  // Wicket-type chips (3-per-row grid, same look as the +runs popup)
  wktChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  wktChip: {
    width: '30.6%', backgroundColor: DS.surfaceHigh, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  wktChipText: { fontSize: 12, fontWeight: '800', color: DS.textPrimary, textTransform: 'capitalize', textAlign: 'center' },

  // 3×3 Grid — flexes to fill the space left below the score/players.
  // minHeight kept modest so the WICKET + END buttons below are always on-screen.
  grid: { flex: 1, marginHorizontal: 16, gap: 8, marginBottom: 8, minHeight: 130 },
  gridRow: { flex: 1, flexDirection: 'row', gap: 8 },
  gridBtn: {
    flex: 1, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', gap: 2
  },
  gridBtnDot: { backgroundColor: DS.surfaceHigh },
  gridBtnFour: { backgroundColor: DS.blue },
  gridBtnSix: { backgroundColor: 'rgba(171,214,0,0.12)' },
  gridBtnWide: { backgroundColor: 'rgba(255,181,158,0.1)' },
  gridBtnWicket: { backgroundColor: DS.wicketBg },
  gridBtnNum: { fontSize: 28, fontWeight: '900', color: DS.textPrimary },
  gridBtnLabel: { fontSize: 11, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.5 },
  gridBtnWideText: { color: DS.coral },

  // Over tracker
  overSection: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 8
  },
  overSectionLabel: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.8 },
  overBalls: { flex: 1, flexDirection: 'row', gap: 6 },
  overBall: { flex: 1, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  overBallEmpty: { backgroundColor: DS.surfaceHighest },
  overBallDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: DS.surfaceHighest },
  overBallText: { fontSize: 11, fontWeight: '800' },

  // Momentum bar
  momentumSection: { marginHorizontal: 16, marginBottom: 12 },
  momentumBar: { height: 6, backgroundColor: DS.surfaceHigh, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  momentumFill: { height: '100%', backgroundColor: DS.lime, borderRadius: 3 },
  momentumLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  momentumLabelLeft: { fontSize: 9, fontWeight: '700', color: DS.lime, letterSpacing: 0.8 },
  momentumLabelRight: { fontSize: 9, fontWeight: '700', color: DS.coral, letterSpacing: 0.8 },

  // Over summary + complete button
  summaryRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 10 },
  summaryCard: { flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 14 },
  summaryTitle: { fontSize: 15, fontWeight: '800', color: DS.textPrimary, marginBottom: 4 },
  summaryBowler: { fontSize: 12, color: DS.textMuted, marginBottom: 10 },
  summaryStats: { flexDirection: 'row', gap: 16 },
  summaryStat: {},
  summaryStatLabel: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.8 },
  summaryStatVal: { fontSize: 20, fontWeight: '900', color: DS.textPrimary },
  completeOverBtn: {
    width: 90, backgroundColor: DS.lime, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12
  },
  completeOverText: { fontSize: 11, fontWeight: '900', color: DS.bg, textAlign: 'center', letterSpacing: 0.5 },

  // Settings sheet / end-reason rows
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 15, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: DS.line,
  },
  settingText: { flex: 1, fontSize: 15, fontWeight: '700', color: DS.textPrimary },

  // Match complete
  completeActions: { marginHorizontal: 16, gap: 10 },
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 16
  },
  completeBtnText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },

  // Bottom tab
  tabBar: {
    flexDirection: 'row', backgroundColor: DS.surfaceLow,
    paddingBottom: 16, paddingTop: 10, borderTopWidth: 0
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 3 },
  tabLabel: { fontSize: 9, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.5 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: DS.surfaceLow, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '60%'
  },
  modalHandle: { width: 40, height: 4, backgroundColor: DS.surfaceHighest, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: DS.textPrimary, marginBottom: 6, textAlign: 'center' },
  modalSub: { fontSize: 11, fontWeight: '600', color: DS.textMuted, marginBottom: 14, textAlign: 'center' },
  playerOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  playerAvatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  playerInitial: { fontSize: 16, fontWeight: '800', color: DS.textPrimary },
  playerName: { flex: 1, fontSize: 15, fontWeight: '500', color: DS.textPrimary },
  modalClose: { backgroundColor: DS.surfaceHigh, borderRadius: 12, paddingVertical: 13, marginTop: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 14, fontWeight: '700', color: DS.textMuted }
});

const makeSetup = (DS) => StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: DS.surfaceHigh,
    alignItems: 'center', justifyContent: 'center'
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: DS.textPrimary, letterSpacing: 0.5 },
  headerSub: { fontSize: 12, color: DS.textMuted, marginTop: 2 },

  body: { padding: 16, gap: 8, paddingBottom: 32 },

  inningsBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(171,214,0,0.08)', borderRadius: 12, padding: 12, marginBottom: 8
  },
  inningsText: { fontSize: 14, fontWeight: '700', color: DS.lime },

  section: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 14, marginBottom: 4 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 1.5, marginBottom: 12 },
  playerRow: { flexDirection: 'row', gap: 10, paddingRight: 8 },
  playerChip: {
    alignItems: 'center', gap: 6, padding: 10,
    backgroundColor: DS.surfaceLow, borderRadius: 14, minWidth: 72
  },
  playerChipActive: { backgroundColor: 'rgba(171,214,0,0.08)', borderWidth: 1.5, borderColor: DS.lime },
  chipAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chipInitial: { fontSize: 18, fontWeight: '900' },
  chipName: { fontSize: 11, fontWeight: '600', color: DS.textVariant, textAlign: 'center', lineHeight: 14 },

  summary: {
    backgroundColor: DS.surfaceLow, borderRadius: 14, padding: 14, gap: 10, marginTop: 4
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryText: { fontSize: 14, color: DS.textVariant },

  footer: {
    backgroundColor: DS.surfaceLow, padding: 16, paddingBottom: 32,
    alignItems: 'center', gap: 8
  },
  // Primary "Action-Taker" CTA — solid electric blue per the design system.
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: DS.blueDeep, borderRadius: 16,
    paddingVertical: 16, width: '100%'
  },
  startBtnDisabled: { backgroundColor: DS.surfaceHighest },
  startBtnText: { fontSize: 16, fontWeight: '900', color: DS.onBlue, letterSpacing: 1 },
  hintText: { fontSize: 12, color: DS.textMuted, textAlign: 'center' }
});