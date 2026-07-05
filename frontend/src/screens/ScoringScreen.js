import { useTheme, useThemedStyles } from "../theme/ThemeContext";import { useState, useEffect, useLayoutEffect, useRef } from 'react';
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
  const [runOutPrompt, setRunOutPrompt] = useState(false); // run out → which batter is out?
  const [runOutFielderPrompt, setRunOutFielderPrompt] = useState(false); // run out → which fielder?
  const [runOutSlot, setRunOutSlot] = useState('striker'); // which batter the run-out dismisses
  const [catchPrompt, setCatchPrompt] = useState(false);   // caught → who took the catch?
  const [newBatterFor, setNewBatterFor] = useState('striker'); // which crease slot the new batter fills
  const [outBatters, setOutBatters] = useState([]);        // player IDs dismissed this innings (can't re-bat)
  const [squadAddFor, setSquadAddFor] = useState(null);    // 'bat' | 'bowl' → add-from-roster sheet
  const [roster, setRoster] = useState([]);                // the team's full roster for the add sheet
  const [freeHit, setFreeHit] = useState(false);           // next legal ball is a free hit (post no-ball)
  const [retiredPrompt, setRetiredPrompt] = useState(false); // Retired → which batter left
  const [retiredKindPrompt, setRetiredKindPrompt] = useState(false); // hurt (return) vs out (wicket)
  const [retiredSlot, setRetiredSlot] = useState('striker'); // which batter is retiring
  const [retiredBatters, setRetiredBatters] = useState([]);  // ids retired hurt (can return to bat)
  const [mvp, setMvp] = useState(null);                    // Player of the Match (computed on completion)
  const [showSettings, setShowSettings] = useState(false); // top-bar settings sheet (End Innings/Match lives here)
  const [endPrompt, setEndPrompt] = useState(false);       // reason picker before ending innings/match
  // Undo: snapshot of everything a ball mutates, pushed before each delivery.
  const [history, setHistory] = useState([]);
  const [undoing, setUndoing] = useState(false);
  const savingRef = useRef(false);   // true while a ball is being persisted (debounces rapid taps)
  const milestoneRef = useRef({ bat: {}, bowl: {}, streak: { id: null, n: 0 } });   // announced milestones + hat-trick streak

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
      setOutBatters(d.dismissedBatters || []);   // dismissed players can't re-bat after resume
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

  // Live milestones: 50/100 for batters, 5-wicket haul for bowlers. Announced once
  // each (tracked in milestoneRef) when the figure is crossed.
  useEffect(() => {
    if (!scoringReady) return;
    const nameOf = (id) => (battingXI.find((p) => p.id === id) || bowlingXI.find((p) => p.id === id) || {}).name || 'Player';
    Object.entries(batStats).forEach(([id, s]) => {
      const prev = milestoneRef.current.bat[id] || 0;
      const hit = s.runs >= 100 && prev < 100 ? 100 : (s.runs >= 50 && prev < 50 ? 50 : null);
      if (hit) { haptic.success(); showToast(`🎉 ${nameOf(id)} ${hit === 100 ? 'HUNDRED' : 'FIFTY'}! ${s.runs}(${s.balls})`, 'success', 2600); }
      milestoneRef.current.bat[id] = s.runs;
    });
    Object.entries(bowlStats).forEach(([id, s]) => {
      const prev = milestoneRef.current.bowl[id] || 0;
      if (s.wickets >= 5 && prev < 5) { haptic.success(); showToast(`🔥 ${nameOf(id)} — 5-wicket haul!`, 'success', 2600); }
      milestoneRef.current.bowl[id] = s.wickets;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batStats, bowlStats]);

  const overStr = `${currentScore.overs}.${currentScore.balls}`;
  const totalOvers = parseInt(matchData.overs, 10) || 20;
  const maxOversPerBowler = Math.ceil(totalOvers / 5);   // T20 → 4, ODI → 10
  const target = isInnings2 ? firstInningsScore.runs + 1 : 0;
  const need = isInnings2 ? Math.max(0, target - currentScore.runs) : 0;
  const ballsLeft = isInnings2 ? Math.max(1, totalOvers * 6 - (currentScore.overs * 6 + currentScore.balls)) : 1;
  // Live run rates: current (CRR) always; required (RRR) during a chase.
  const ballsBowled = currentScore.overs * 6 + currentScore.balls;
  const crr = ballsBowled > 0 ? (currentScore.runs / (ballsBowled / 6)).toFixed(2) : '0.00';
  const rrr = isInnings2 && ballsLeft > 0 ? (need / (ballsLeft / 6)).toFixed(2) : null;

  // countsAsBall=false for penalty runs — they're a team award, not a delivery,
  // so the over/ball count must not advance.
  const persistBall = async (runs, extras, extraType, isWicket, wicketType, countsAsBall = true, dismissedId = null, catcher = null) => {
    if (!currentInningId || !striker || !nonStriker || !currentBowler) return;
    const overNumber = currentScore.overs + 1;
    const newBallCount = countsAsBall ? ballCount + 1 : ballCount;
    if (countsAsBall) setBallCount(newBallCount);
    await legendsApi.updateScore(matchData.id, {
      inningId: currentInningId, overNumber, ballNumber: newBallCount,
      bowlerId: currentBowler.id, batterId: striker.id, nonStrikerId: nonStriker.id,
      runs, extras, extraType: extraType || null,
      isWicket, wicketType: wicketType || null,
      // Usually the striker is out; a run-out can dismiss the non-striker.
      dismissedPlayerId: isWicket ? (dismissedId || striker.id) : null,
      wicketAssists: catcher || null,   // catcher / keeper / run-out fielder name
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
    // Match's over — never leave the bowler picker (or any prompt) hanging.
    setShowBowlerModal(false); setMustPickBowler(false);
    setShowPlayerModal(false); setOverSummary(null);
    const scoreStr = `${finalScore.runs}/${finalScore.wickets} (${finalScore.overs}.${finalScore.balls})`;
    await legendsApi.updateMatch(matchData.id, { status: 'completed', score2: scoreStr, result });
    computeMvp();
    Alert.alert('Match Complete!', result);
  };

  // Player of the Match — simple all-round score (runs + 20·wickets) across both
  // innings, from the full scorecard. Run-outs/retirements aren't bowler wickets.
  const computeMvp = async () => {
    const sc = await legendsApi.getScorecard(matchData.id);
    if (!sc.success) return;
    const pts = {};
    (sc.data?.innings || []).forEach((inn) => (inn.oversData || []).forEach((over) => {
      (over.balls || []).forEach((ball) => {
        const bat = ball.batterId;
        if (bat) {
          pts[bat] = pts[bat] || { name: ball.batter?.name || 'Player', runs: 0, wickets: 0 };
          if (!ball.extraType || ball.extraType === 'noBall') pts[bat].runs += ball.runs;
        }
        if (ball.isWicket) {
          const wt = String(ball.wicketType || '').toLowerCase().replace(/\s/g, '');
          if (wt !== 'runout' && wt !== 'retired' && wt !== 'retiredhurt' && over.bowlerId) {
            pts[over.bowlerId] = pts[over.bowlerId] || { name: over.bowler?.name || 'Player', runs: 0, wickets: 0 };
            pts[over.bowlerId].wickets += 1;
          }
        }
      });
    }));
    let best = null;
    Object.values(pts).forEach((p) => { p.score = p.runs + p.wickets * 20; if (!best || p.score > best.score) best = p; });
    if (best) setMvp(best);
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
    if (prev.outBatters) setOutBatters(prev.outBatters);
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
  // dismissed = 'striker' | 'nonstriker' — a run-out can dismiss the non-striker.
  // catcher = fielder/keeper/bowler name for a caught dismissal (shown in scorecard).
  const handleScore = async (value, addRuns = 0, wicketType = 'bowled', dismissed = 'striker', catcher = null) => {
    if (matchComplete || undoing) return;
    // Debounce: ignore a new tap while the previous ball is still being saved. Rapid
    // taps during the async save read a stale score and used to pile balls into one
    // over (8–12 ball overs). Real scoring is seconds apart, so this only drops
    // accidental double-taps.
    if (savingRef.current) return;
    // Guard the FIRST ball of an over (any path, incl. resume/setup picks): if the
    // bowler is over their spell limit or would bowl consecutive overs, silently
    // reopen the (eligible-only) bowler picker — no popup.
    if (currentScore.balls === 0 && currentBowler) {
      const bowled = bowlerOvers[currentBowler.id] || 0;
      if (bowled >= maxOversPerBowler || currentBowler.id === lastOverBowlerId) {
        setMustPickBowler(true); setShowBowlerModal(true);
        return;
      }
    }
    savingRef.current = true;
    try {
    // Snapshot the pre-ball state so this delivery can be taken back.
    setHistory((h) => [...h.slice(-49), {
      score: { ...currentScore }, over: [...currentOver], ballCount,
      striker, nonStriker, bowler: currentBowler,
      batStats: { ...batStats }, bowlStats: { ...bowlStats }, outBatters: [...outBatters],
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
      const outNon = dismissed === 'nonstriker';        // run-out of the non-striker
      const outPlayer = outNon ? nonStriker : striker;
      newScore.wickets += 1;
      newScore.balls += 1;
      newOver.push('W');
      await persistBall(0, 0, null, true, wicketType, true, outPlayer?.id, catcher);
      if (outPlayer) setOutBatters((prev) => [...prev, outPlayer.id]);   // can't re-bat this innings
      // Clear the dismissed batter's slot and ask for a replacement for THAT end.
      if (outNon) setNonStriker(null); else setStriker(null);
      if (newScore.wickets < 10) { setNewBatterFor(outNon ? 'nonstriker' : 'striker'); setShowPlayerModal(true); }
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
      // Don't prompt for the next over's bowler if the innings/match just ended:
      // last over bowled, all out, or the chase (innings 2) is already won.
      const chaseWon = isInnings2 && newScore.runs >= target;
      if (newScore.overs < totalOvers && newScore.wickets < 10 && !chaseWon) {
        setMustPickBowler(true); setShowBowlerModal(true);
      }
    } else {
      setCurrentOver(newOver);
    }

    // Free Hit: a no-ball sets it for the next legal ball; a legal delivery consumes
    // it (a wide keeps it alive; penalty runs don't affect it).
    if (value === 'noball') setFreeHit(true);
    else if (typeof value === 'number' || value === 'bye' || value === 'legbye' || value === 'out') setFreeHit(false);

    // Hat-trick: 3 bowler-credited wickets on consecutive deliveries by one bowler.
    const st = milestoneRef.current.streak;
    const bowlerWkt = value === 'out' && !['runout', 'retiredout', 'retired'].includes(String(wicketType).toLowerCase().replace(/\s/g, ''));
    if (bowlerWkt && currentBowler) {
      st.n = st.id === currentBowler.id ? st.n + 1 : 1;
      st.id = currentBowler.id;
      if (st.n === 3) { haptic.success(); showToast(`🎩 HAT-TRICK! ${currentBowler.name}`, 'success', 3000); }
    } else if (typeof value === 'number' || value === 'bye' || value === 'legbye') {
      st.n = 0;   // a legal delivery with no wicket breaks the streak (extras don't)
    }

    setCurrentScore(newScore);
    const scoreStr = `${newScore.runs}/${newScore.wickets} (${newScore.overs}.${newScore.balls})`;
    if (!isInnings2) legendsApi.updateMatch(matchData.id, { score1: scoreStr });
    if (isInnings2) checkWinCondition(newScore);
    if (!isInnings2 && (newScore.wickets >= 10 || newScore.overs >= totalOvers && newScore.balls === 0)) {
      finishInnings(newScore.wickets >= 10 ? 'All out' : 'Overs completed', newScore);
    }
    } finally {
      savingRef.current = false;
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
      // Fresh innings → reset per-player figures + bowling spell tracking + dismissals.
      setBatStats({}); setBowlStats({}); setBowlerOvers({}); setLastOverBowlerId(null); setOutBatters([]); setRetiredBatters([]);
      milestoneRef.current = { bat: {}, bowl: {}, streak: { id: null, n: 0 } };   // fresh milestones for the new innings
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

  // Pull a player from the team's full roster into the live match squad. `kind`
  // is 'bat' (batting side) or 'bowl' (bowling side); adds to the match + local XI
  // and selects them straight away (as new batter or as the bowler).
  const openSquadAdd = async (kind) => {
    setSquadAddFor(kind);
    setRoster([]);
    const teamId = kind === 'bat' ? battingTeamId : bowlingTeamId;
    const res = await legendsApi.getPlayers({ teamId, sport: 'cricket' });
    setRoster(res.data || []);
  };

  const addFromSquad = async (p) => {
    const kind = squadAddFor;
    const teamId = kind === 'bat' ? battingTeamId : bowlingTeamId;
    const entry = { id: p.id, name: p.name };
    await legendsApi.addMatchPlayer(matchData.id, { playerId: p.id, teamId });
    if (kind === 'bat') {
      setBattingXI((xi) => xi.some((x) => x.id === p.id) ? xi : [...xi, entry]);
      if (newBatterFor === 'nonstriker') setNonStriker(entry); else setStriker(entry);
      setShowPlayerModal(false); setNewBatterFor('striker');
    } else {
      setBowlingXI((xi) => xi.some((x) => x.id === p.id) ? xi : [...xi, entry]);
      setCurrentBowler(entry); setShowBowlerModal(false); setMustPickBowler(false);
    }
    setSquadAddFor(null);
  };

  // Retired hurt — the batter leaves the crease, NOT out, and can return later
  // (kept out of outBatters, so they're selectable again). No ball is bowled.
  const retireBatsman = (slot) => {
    setRetiredKindPrompt(false);
    const leaving = slot === 'nonstriker' ? nonStriker : striker;
    if (leaving) setRetiredBatters((prev) => prev.some((r) => r.id === leaving.id) ? prev : [...prev, { id: leaving.id, name: leaving.name }]);
    if (slot === 'nonstriker') { setNonStriker(null); setNewBatterFor('nonstriker'); }
    else { setStriker(null); setNewBatterFor('striker'); }
    setShowPlayerModal(true);
  };

  // Retired out — counts as a wicket but is NOT a delivery (no ball faced, over
  // unchanged). Recorded via a ball with extraType 'retired' + countsAsBall=false.
  const retireOut = async (slot) => {
    setRetiredKindPrompt(false);
    if (matchComplete) return;
    const leaving = slot === 'nonstriker' ? nonStriker : striker;
    if (!leaving) return;
    setHistory((h) => [...h.slice(-49), {
      score: { ...currentScore }, over: [...currentOver], ballCount,
      striker, nonStriker, bowler: currentBowler,
      batStats: { ...batStats }, bowlStats: { ...bowlStats }, outBatters: [...outBatters],
    }]);
    haptic.warn();
    await persistBall(0, 0, 'retired', true, 'retiredout', false, leaving.id);
    setOutBatters((prev) => [...prev, leaving.id]);
    const newScore = { ...currentScore, wickets: currentScore.wickets + 1 };
    if (slot === 'nonstriker') { setNonStriker(null); setNewBatterFor('nonstriker'); }
    else { setStriker(null); setNewBatterFor('striker'); }
    setCurrentScore(newScore);
    if (newScore.wickets < 10) setShowPlayerModal(true);
    else finishInnings('All out', newScore);
  };

  const getAvailableBatsmen = () => {
    // Exclude whoever's at the crease AND anyone already dismissed this innings.
    const usedIds = [striker?.id, nonStriker?.id, ...outBatters].filter(Boolean);
    return battingXI.filter((p) => !usedIds.includes(p.id));
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
        <TouchableOpacity style={styles.scoreCard} activeOpacity={0.85}
          onPress={() => matchData?.id && navigation.navigate('Scorecard', { matchId: matchData.id })}>
          <View style={styles.scoreLeft}>
            <Text style={styles.scoreLabel}>CURRENT SCORE  ›  SCORECARD</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreMain}>{currentScore.runs}/{currentScore.wickets}</Text>
              <Text style={styles.scoreOvers}> ({overStr})</Text>
            </View>
            <Text style={styles.crrText}>CRR {crr}{rrr ? `   ·   RRR ${rrr}` : ''}</Text>
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
        </TouchableOpacity>

        {/* ── CURRENT OVER TRACKER (compact) ── */}
        <View style={styles.overSection}>
          <Text style={styles.overSectionLabel}>THIS OVER</Text>
          {freeHit && <View style={styles.freeHitPill}><Text style={styles.freeHitText}>FREE HIT</Text></View>}
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
        <TouchableOpacity style={styles.wicketBtn}
          onPress={() => freeHit ? setRunOutPrompt(true) : setWicketPrompt(true)}>
          <Icon name="alert-octagon" size={20} color={DS.wicketText} />
          <Text style={styles.wicketBtnText}>WICKET{freeHit ? ' (RUN OUT ONLY)' : ''}</Text>
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
            <View style={styles.resultCard}>
              <Text style={styles.resultCardText}>{matchResult}</Text>
              {mvp &&
                <View style={styles.mvpRow}>
                  <Icon name="star-circle" size={18} color={DS.lime} />
                  <Text style={styles.mvpText}>
                    Player of the Match: <Text style={styles.mvpName}>{mvp.name}</Text>
                    {'  '}<Text style={styles.mvpStat}>({mvp.runs} runs{mvp.wickets ? `, ${mvp.wickets} wkt${mvp.wickets > 1 ? 's' : ''}` : ''})</Text>
                  </Text>
                </View>
              }
            </View>
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
            <Text style={styles.modalTitle}>
              New Batsman{newBatterFor === 'nonstriker' ? ' (non-striker)' : ''}
            </Text>
            <ScrollView>
              {getAvailableBatsmen().map((p, i) => {
                const resuming = retiredBatters.some((r) => r.id === p.id);   // retired hurt, coming back
                return (
                <TouchableOpacity key={i} style={styles.playerOption}
                onPress={() => {
                  if (newBatterFor === 'nonstriker') setNonStriker(p); else setStriker(p);
                  if (resuming) setRetiredBatters((prev) => prev.filter((r) => r.id !== p.id));
                  setShowPlayerModal(false); setNewBatterFor('striker');
                }}>
                  <View style={[styles.playerAvatar, resuming && { backgroundColor: DS.lime + '33' }]}>
                    <Text style={[styles.playerInitial, resuming && { color: DS.lime }]}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.playerName, { flex: 1 }]}>{p.name}</Text>
                  {resuming
                    ? <Text style={[styles.modalSub, { marginBottom: 0, color: DS.lime }]}>retired · resume</Text>
                    : <Icon name="chevron-right" size={18} color={DS.textMuted} />}
                </TouchableOpacity>);
              })}
            </ScrollView>
            <TouchableOpacity style={styles.squadAddBtn} onPress={() => openSquadAdd('bat')}>
              <Icon name="account-plus" size={18} color={DS.lime} />
              <Text style={styles.squadAddText}>Add from squad</Text>
            </TouchableOpacity>
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
              Only eligible bowlers shown · max {maxOversPerBowler} overs each · no consecutive overs
            </Text>
            <ScrollView>
              {(() => {
                // Auto-list only eligible bowlers: exclude whoever bowled the last
                // over (no consecutive overs) and anyone who has maxed their spell.
                const eligible = bowlingXI.filter((p) =>
                  p.id !== lastOverBowlerId && (bowlerOvers[p.id] || 0) < maxOversPerBowler);
                if (eligible.length === 0) {
                  return <Text style={[styles.modalSub, { textAlign: 'center', marginVertical: 16 }]}>No eligible bowlers left.</Text>;
                }
                return eligible.map((p, i) => (
                  <TouchableOpacity key={i} style={styles.playerOption}
                    onPress={() => { setCurrentBowler(p); setShowBowlerModal(false); setMustPickBowler(false); }}>
                    <View style={[styles.playerAvatar, { backgroundColor: DS.lime + '33' }]}>
                      <Text style={[styles.playerInitial, { color: DS.lime }]}>{p.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.playerName, { flex: 1 }]}>{p.name}</Text>
                    <Text style={[styles.modalSub, { marginBottom: 0 }]}>{bowlerOvers[p.id] || 0}/{maxOversPerBowler} ov</Text>
                    <Icon name="chevron-right" size={18} color={DS.textMuted} />
                  </TouchableOpacity>
                ));
              })()}
            </ScrollView>
            <TouchableOpacity style={styles.squadAddBtn} onPress={() => openSquadAdd('bowl')}>
              <Icon name="account-plus" size={18} color={DS.lime} />
              <Text style={styles.squadAddText}>Add from squad</Text>
            </TouchableOpacity>
            {!mustPickBowler && (
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowBowlerModal(false)}>
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ── ADD FROM SQUAD — pull a roster player into the live match ── */}
      <Modal visible={!!squadAddFor} transparent animationType="slide" onRequestClose={() => setSquadAddFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add {squadAddFor === 'bowl' ? 'Bowler' : 'Batsman'} from Squad</Text>
            <Text style={styles.modalSub}>{squadAddFor === 'bowl' ? bowlingTeamName : battingTeamName} roster</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {(() => {
                const inXI = (squadAddFor === 'bowl' ? bowlingXI : battingXI).map((x) => x.id);
                const avail = roster.filter((p) => !inXI.includes(p.id));
                if (avail.length === 0) {
                  return <Text style={[styles.modalSub, { textAlign: 'center', marginVertical: 16 }]}>Everyone in the squad is already in this match.</Text>;
                }
                return avail.map((p, i) => (
                  <TouchableOpacity key={i} style={styles.playerOption} onPress={() => addFromSquad(p)}>
                    <View style={styles.playerAvatar}>
                      <Text style={styles.playerInitial}>{(p.name || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.playerName, { flex: 1 }]}>{p.name}</Text>
                    {p.role ? <Text style={[styles.modalSub, { marginBottom: 0 }]}>{p.role}</Text> : null}
                    <Icon name="plus-circle" size={18} color={DS.lime} />
                  </TouchableOpacity>
                ));
              })()}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setSquadAddFor(null)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
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
                ['retired', 'bandage'],
              ].map(([type, icon]) => (
                <TouchableOpacity key={type} style={styles.wktChip}
                  onPress={() => {
                    setWicketPrompt(false);
                    const wt = type.replace(/ /g, '');
                    // Run-out → which batter is out; caught → who caught; retired → who.
                    if (wt === 'runout') setRunOutPrompt(true);
                    else if (wt === 'caught') setCatchPrompt(true);
                    else if (wt === 'retired') setRetiredPrompt(true);
                    else handleScore('out', 0, wt);
                  }}>
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

      {/* ── RUN OUT — which batter is out? (striker or non-striker) ── */}
      <Modal visible={runOutPrompt} transparent animationType="slide" onRequestClose={() => setRunOutPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Run out — who is out?</Text>
            <Text style={styles.modalSub}>Which batter was run out</Text>
            {[['striker', striker], ['nonstriker', nonStriker]].map(([slot, player]) => (
              <TouchableOpacity key={slot} style={styles.settingRow}
                onPress={() => { setRunOutSlot(slot); setRunOutPrompt(false); setRunOutFielderPrompt(true); }}>
                <View style={[styles.playerAvatar, { backgroundColor: DS.wicketBg }]}>
                  <Text style={[styles.playerInitial, { color: DS.wicketText }]}>{(player?.name || '?').charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={[styles.settingText, { flex: 1 }]}>
                  {player?.name || '—'} <Text style={styles.modalSub}>({slot === 'striker' ? 'striker' : 'non-striker'})</Text>
                </Text>
                <Icon name="chevron-right" size={18} color={DS.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalClose} onPress={() => setRunOutPrompt(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── RUN OUT — which fielder effected it? (shown as 'run out (Fielder)') ── */}
      <Modal visible={runOutFielderPrompt} transparent animationType="slide" onRequestClose={() => setRunOutFielderPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Run out — which fielder?</Text>
            <Text style={styles.modalSub}>Who effected the run out</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {bowlingXI.map((p, i) => (
                <TouchableOpacity key={i} style={styles.playerOption}
                  onPress={() => { setRunOutFielderPrompt(false); handleScore('out', 0, 'runout', runOutSlot, p.name); }}>
                  <View style={styles.playerAvatar}>
                    <Text style={styles.playerInitial}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.playerName, { flex: 1 }]}>{p.name}</Text>
                  <Icon name="chevron-right" size={18} color={DS.textMuted} />
                </TouchableOpacity>
              ))}
              {/* Fall back to no fielder credit (e.g. direct-hit uncertainty) */}
              <TouchableOpacity style={styles.playerOption}
                onPress={() => { setRunOutFielderPrompt(false); handleScore('out', 0, 'runout', runOutSlot, null); }}>
                <View style={[styles.playerAvatar, { backgroundColor: DS.surfaceHigh }]}>
                  <Icon name="help" size={16} color={DS.textMuted} />
                </View>
                <Text style={[styles.playerName, { flex: 1 }]}>Not sure / no fielder</Text>
                <Icon name="chevron-right" size={18} color={DS.textMuted} />
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setRunOutFielderPrompt(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── RETIRED — which batter? then hurt (return) or out (wicket) ── */}
      <Modal visible={retiredPrompt} transparent animationType="slide" onRequestClose={() => setRetiredPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Retired — who left?</Text>
            <Text style={styles.modalSub}>Pick the batter, then hurt or out</Text>
            {[['striker', striker], ['nonstriker', nonStriker]].map(([slot, player]) => (
              <TouchableOpacity key={slot} style={styles.settingRow}
                onPress={() => { setRetiredSlot(slot); setRetiredPrompt(false); setRetiredKindPrompt(true); }}>
                <View style={[styles.playerAvatar, { backgroundColor: DS.lime + '33' }]}>
                  <Text style={[styles.playerInitial, { color: DS.lime }]}>{(player?.name || '?').charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={[styles.settingText, { flex: 1 }]}>
                  {player?.name || '—'} <Text style={styles.modalSub}>({slot === 'striker' ? 'striker' : 'non-striker'})</Text>
                </Text>
                <Icon name="chevron-right" size={18} color={DS.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalClose} onPress={() => setRetiredPrompt(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── RETIRED — hurt (not out, can return) or out (counts as a wicket) ── */}
      <Modal visible={retiredKindPrompt} transparent animationType="slide" onRequestClose={() => setRetiredKindPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Retired hurt or out?</Text>
            <TouchableOpacity style={styles.settingRow} onPress={() => retireBatsman(retiredSlot)}>
              <View style={[styles.playerAvatar, { backgroundColor: DS.lime + '33' }]}>
                <Icon name="bandage" size={16} color={DS.lime} />
              </View>
              <Text style={[styles.settingText, { flex: 1 }]}>Retired hurt <Text style={styles.modalSub}>(not out · can return)</Text></Text>
              <Icon name="chevron-right" size={18} color={DS.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingRow} onPress={() => retireOut(retiredSlot)}>
              <View style={[styles.playerAvatar, { backgroundColor: DS.wicketBg }]}>
                <Icon name="flag-checkered" size={16} color={DS.wicketText} />
              </View>
              <Text style={[styles.settingText, { flex: 1, color: DS.wicketText }]}>Retired out <Text style={styles.modalSub}>(counts as a wicket)</Text></Text>
              <Icon name="chevron-right" size={18} color={DS.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalClose} onPress={() => setRetiredKindPrompt(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── CAUGHT — who took the catch? (c&b / keeper / fielder) ── */}
      <Modal visible={catchPrompt} transparent animationType="slide" onRequestClose={() => setCatchPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Who took the catch?</Text>
            <Text style={styles.modalSub}>Caught &amp; bowled, keeper, or a fielder</Text>
            {/* Caught & bowled — the bowler catches their own delivery */}
            <TouchableOpacity style={styles.settingRow}
              onPress={() => { setCatchPrompt(false); handleScore('out', 0, 'caught', 'striker', currentBowler?.name); }}>
              <View style={[styles.playerAvatar, { backgroundColor: DS.wicketBg }]}>
                <Icon name="cricket" size={16} color={DS.wicketText} />
              </View>
              <Text style={[styles.settingText, { flex: 1 }]}>Caught &amp; Bowled <Text style={styles.modalSub}>({currentBowler?.name})</Text></Text>
              <Icon name="chevron-right" size={18} color={DS.textMuted} />
            </TouchableOpacity>
            {/* Any fielder / keeper from the bowling XI (excluding the bowler) */}
            <ScrollView style={{ maxHeight: 260 }}>
              {bowlingXI.filter((p) => p.id !== currentBowler?.id).map((p, i) => (
                <TouchableOpacity key={i} style={styles.playerOption}
                  onPress={() => { setCatchPrompt(false); handleScore('out', 0, 'caught', 'striker', p.name); }}>
                  <View style={styles.playerAvatar}>
                    <Text style={styles.playerInitial}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.playerName, { flex: 1 }]}>{p.name}</Text>
                  <Icon name="chevron-right" size={18} color={DS.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setCatchPrompt(false)}>
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
  crrText: { fontSize: 12, fontWeight: '700', color: DS.lime, marginTop: 2 },
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
  freeHitPill: { backgroundColor: DS.limeBright, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  freeHitText: { fontSize: 9, fontWeight: '900', color: DS.bg, letterSpacing: 0.8 },
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

  // "Add from squad" button (batsman/bowler pickers)
  squadAddBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 8, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: DS.lime, borderStyle: 'dashed',
  },
  squadAddText: { fontSize: 14, fontWeight: '800', color: DS.lime, letterSpacing: 0.3 },

  // Match complete
  completeActions: { marginHorizontal: 16, gap: 10 },
  resultCard: { backgroundColor: DS.surfaceHigh, borderRadius: 14, padding: 14, gap: 8, borderLeftWidth: 4, borderLeftColor: DS.lime },
  resultCardText: { fontSize: 16, fontWeight: '900', color: DS.textPrimary },
  mvpRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mvpText: { flex: 1, fontSize: 12, color: DS.textMuted, fontWeight: '600' },
  mvpName: { color: DS.textPrimary, fontWeight: '800' },
  mvpStat: { color: DS.lime, fontWeight: '700' },
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