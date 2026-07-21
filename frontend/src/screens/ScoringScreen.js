import { useTheme, useThemedStyles } from "../theme/ThemeContext";import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Modal, Share, StatusBar, Dimensions, BackHandler,
  Animated, PanResponder } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { haptic } from '../utils/haptics';
import { showToast } from '../components/Toast';
import MatchPhotos from '../components/MatchPhotos';
import MatchAwardsModal from "../components/MatchAwardsModal";
import PlayerAvatar from "../components/PlayerAvatar";
import { BRAND_NAME, BRAND_TAGLINE } from "../components/BrandLogo";

const { width } = Dimensions.get('window');
















export default function ScoringScreen({ route, navigation }) {const { colors: DS, isDark } = useTheme();const styles = useThemedStyles(makeStyles);const setup = useThemedStyles(makeSetup);
  const { match, resume, matchId: resumeId } = route.params || {};
  const [matchData, setMatchData] = useState(match || {});

  useLayoutEffect(() => {
    // Full-screen console — hide the stack "Scoring" header; the scoreboard's own
    // back button + brand replace it, reclaiming the top of the screen.
    navigation.setOptions({ headerShown: false });
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
  const [setupSelecting, setSetupSelecting] = useState(null); // 'striker' | 'nonstriker' | 'bowler'
  const [showBowlerModal, setShowBowlerModal] = useState(false);
  // At over-end the bowler MUST change (no consecutive overs) → mandatory, non-
  // dismissable picker. A manual mid-over swap stays optional/cancellable.
  const [mustPickBowler, setMustPickBowler] = useState(false);
  const [matchComplete, setMatchComplete] = useState(false);
  const [matchResult, setMatchResult] = useState('');
  // Post-match awards popup (MVP): fetched when the match completes.
  const [showAwards, setShowAwards] = useState(false);
  const [awards, setAwards] = useState(null);
  const [awardsLoading, setAwardsLoading] = useState(false);
  const awardsFetched = useRef(false);
  const [currentInningId, setCurrentInningId] = useState('');
  const [ballCount, setBallCount] = useState(0);
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
  const [penaltyPrompt, setPenaltyPrompt] = useState(false); // PEN 5 → reason sheet (Helmet Hit)
  const [penaltyDeliveryPrompt, setPenaltyDeliveryPrompt] = useState(false); // after Helmet Hit → which delivery?
  const [runOutPrompt, setRunOutPrompt] = useState(false); // run out → which batter is out?
  const [runOutFielderPrompt, setRunOutFielderPrompt] = useState(false); // run out → which fielder?
  const [runOutSlot, setRunOutSlot] = useState('striker'); // which batter the run-out dismisses
  const [catchPrompt, setCatchPrompt] = useState(false);   // caught → who took the catch?
  const [newBatterFor, setNewBatterFor] = useState('striker'); // which crease slot the new batter fills
  // A wicket on the LAST ball of an over: the ends change, but only AFTER the new
  // batter walks in — so the not-out batter is on strike next over. We defer that
  // swap until the replacement is picked (see the New Batsman modal).
  const [pendingCreaseSwap, setPendingCreaseSwap] = useState(false);
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
  const [morePrompt, setMorePrompt] = useState(false);     // bottom "More options" sheet (Change bowler, Retire)
  const [showExitModal, setShowExitModal] = useState(false);
  // Swipe-down-to-dismiss for the Pause/Leave drawer: drag the top of the sheet
  // down past a threshold (or flick) to close; otherwise it springs back.
  const exitDragY = useRef(new Animated.Value(0)).current;
  const closeExitDrawer = () => {
    Animated.timing(exitDragY, { toValue: 600, duration: 180, useNativeDriver: true })
      .start(() => { setShowExitModal(false); exitDragY.setValue(0); });
  };
  const exitPan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) exitDragY.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 120 || g.vy > 0.8) closeExitDrawer();
      else Animated.spring(exitDragY, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;
  const [transferPrompt, setTransferPrompt] = useState(false);   // transfer-scorer sheet
  const [transferCandidates, setTransferCandidates] = useState([]);
  const [endPrompt, setEndPrompt] = useState(false);       // reason picker before ending innings/match
  // Undo: snapshot of everything a ball mutates, pushed before each delivery.
  const [history, setHistory] = useState([]);
  const [undoing, setUndoing] = useState(false);
  const savingRef = useRef(false);   // true while a ball is being persisted (debounces rapid taps)
  const milestoneRef = useRef({ bat: {}, bowl: {}, streak: { id: null, n: 0 } });   // announced milestones + hat-trick streak
  const overScrollRef = useRef(null);   // "this over" tracker — auto-scrolled to the latest ball

  // Keep the just-scored ball in view: once an over runs past 6 balls (wides/
  // no-balls) or the strip overflows the header width, scroll to the end so the
  // current delivery is always visible without a manual swipe.
  useEffect(() => {
    overScrollRef.current?.scrollToEnd({ animated: true });
  }, [currentOver]);

  // When the match finishes, compute the MVP awards once and pop the winner
  // sheet for the scorer. Dismissing it redirects to the Home feed.
  useEffect(() => {
    if (!matchComplete || awardsFetched.current || !matchData?.id) return;
    awardsFetched.current = true;
    setShowAwards(true);
    setAwardsLoading(true);
    legendsApi.getMatchAwards(matchData.id)
      .then((res) => { if (res.success) setAwards(res.data.awards); })
      .catch(() => {})
      .finally(() => setAwardsLoading(false));
  }, [matchComplete, matchData?.id]);

  const closeAwards = () => {
    setShowAwards(false);
    // Match's over → Home feed with a CLEAN stack. A fresh Toss & Play match
    // leaves StartMatch → TossLineup → Scoring stacked here; a plain navigate/back
    // would drop the user onto the create/schedule screen. Reset wipes that trail.
    navigation.reset({
      index: 0,
      routes: [{ name: 'CricketFeed' }],
    });
  };

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

  // ── Scorer gate: check as soon as the match id is known (fresh match or resume),
  // BEFORE the player-picker/scoring UI is interactable. Anyone can still open a
  // match from My Matches (visibility ≠ scoring rights) — spectators (team members,
  // followers) are sent straight to the live-updating Scorecard instead, same as
  // watching on Cricbuzz/Cricinfo. No interruption, no "ask them to transfer" message.
  useEffect(() => {
    const id = matchData?.id;
    if (!id) return;
    let live = true;
    legendsApi.getScorerInfo(id).then((res) => {
      if (!live || !res.success) return;
      if (!res.isScorer) {
        navigation.replace('Scorecard', { matchId: id });
      }
    });
    return () => { live = false; };
  }, [matchData?.id, navigation]);

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
        // team1/team2 identity is needed to map the batting score onto the correct
        // summary field (score1 = team1, score2 = team2) on resume too.
        team1Id: d.team1, team2Id: d.team2,
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
      // Seed the milestone tracker with whatever's already been reached — a fresh
      // mount's milestoneRef starts empty while batStats/bowlStats come back at
      // their full accumulated totals, so without this every resume replays the
      // "FIFTY!"/"HUNDRED!"/5-wicket-haul toast for any player already past the
      // mark, dismissed or not.
      milestoneRef.current.bat = Object.fromEntries(
        Object.entries(d.battingFigures || {}).map(([id, f]) => [id, f.runs])
      );
      milestoneRef.current.bowl = Object.fromEntries(
        Object.entries(d.bowlingFigures || {}).map(([id, f]) => [id, f.wickets])
      );
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
  }, [resume, resumeId]);

  // ── Prevent accidental exit
  useEffect(() => {
    const backAction = () => {
      // The Scorecard is pushed on top of this screen; while it's up, this
      // listener is still mounted underneath. Don't hijack its back press —
      // let it fall through so the Scorecard pops back here as expected.
      if (!navigation.isFocused()) return false;
      setShowExitModal(true);
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [navigation]);

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
      // Track the HIGHEST runs ever seen, not the latest — an UNDO can drop
      // s.runs back below 50 without un-announcing the milestone; if we stored
      // the raw value here, re-crossing 50 on the same innings would re-fire
      // the toast every time the scorer undoes and re-scores past it.
      milestoneRef.current.bat[id] = Math.max(prev, s.runs);
    });
    Object.entries(bowlStats).forEach(([id, s]) => {
      const prev = milestoneRef.current.bowl[id] || 0;
      if (s.wickets >= 5 && prev < 5) { haptic.success(); showToast(`🔥 ${nameOf(id)} — 5-wicket haul!`, 'success', 2600); }
      milestoneRef.current.bowl[id] = Math.max(prev, s.wickets);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batStats, bowlStats]);

  const overStr = `${currentScore.overs}.${currentScore.balls}`;
  // Short team code for the compact header (e.g. "Mumbai Indians" → "MUM").
  // Multi-word/hyphenated names abbreviate to initials (e.g. "Deccan Vipers Inc"
  // → "DVI", "D-Vigo-S" → "DVS"); a single word falls back to its first 3
  // letters (e.g. "Mavericks" → "MAV"). Splits on any run of non-letters, so
  // spaces, hyphens, underscores, etc. all count as word breaks.
  const shortCode = (n) => {
    const words = (n || '').split(/[^A-Za-z]+/).filter(Boolean);
    if (words.length > 1) return words.map((w) => w[0]).join('').slice(0, 3).toUpperCase() || '—';
    return (words[0] || '').slice(0, 3).toUpperCase() || '—';
  };
  const totalOvers = parseInt(matchData.overs, 10) || 20;
  // How far back Undo can reach. The old cap of 50 snapshots couldn't wind back
  // a whole innings — a T20 is 120+ deliveries — so a scorer who spotted a
  // mistake early had no way to reach it. History is cleared at the innings
  // break, so the stack is already bounded by one innings; size it to that,
  // with headroom for extras (which are balls but don't advance the over).
  const UNDO_DEPTH = totalOvers * 6 + 120;
  const maxOversPerBowler = Math.ceil(totalOvers / 5);   // T20 → 4, ODI → 10
  // "Change Bowler" is only valid mid-over: scoring live, a bowler is set, and the
  // next-over bowler pick isn't already up (the modal auto-opens at over's end).
  const canChangeBowler = scoringReady && !matchComplete && !mustPickBowler && !!currentBowler;
  const target = isInnings2 ? firstInningsScore.runs + 1 : 0;
  const need = isInnings2 ? Math.max(0, target - currentScore.runs) : 0;
  const ballsLeft = isInnings2 ? Math.max(1, totalOvers * 6 - (currentScore.overs * 6 + currentScore.balls)) : 1;
  // Live run rates: current (CRR) always; required (RRR) during a chase.
  const ballsBowled = currentScore.overs * 6 + currentScore.balls;
  const crr = ballsBowled > 0 ? (currentScore.runs / (ballsBowled / 6)).toFixed(2) : '0.00';
  const rrr = isInnings2 && ballsLeft > 0 ? (need / (ballsLeft / 6)).toFixed(2) : null;

  // countsAsBall=false for penalty runs — they're a team award, not a delivery,
  // so the over/ball count must not advance.
  // Throws if the server rejects the ball (e.g. 403 — not the assigned scorer) so
  // callers stop mutating local state instead of silently drifting from the server.
  const persistBall = async (runs, extras, extraType, isWicket, wicketType, countsAsBall = true, dismissedId = null, catcher = null) => {
    // Never skip the save silently: the local score would keep advancing (and
    // syncMatchSummary would keep updating the headline score) while the
    // ball-by-ball record stops — spectators then see totals move with no
    // deliveries behind them. Throw so handleScore alerts and doesn't apply
    // the ball locally.
    if (!striker || !nonStriker) throw new Error('Pick the new batsman before scoring the next ball');
    if (!currentInningId || !currentBowler) throw new Error('Match state is still loading — try again in a moment');
    const overNumber = currentScore.overs + 1;
    const newBallCount = countsAsBall ? ballCount + 1 : ballCount;
    const res = await legendsApi.updateScore(matchData.id, {
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
    if (!res.success) throw new Error(res.error || 'Could not save this ball');
    // Advance the local ball count only once the delivery is actually stored.
    // Bumping it before the await meant a rejected ball (e.g. the server's 409
    // bowling-rule guards) still moved the count on, so the on-screen over
    // drifted a ball ahead of what was recorded.
    if (countsAsBall) setBallCount(newBallCount);
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
    setShowPlayerModal(false);
    const scoreStr = `${finalScore.runs}/${finalScore.wickets} (${finalScore.overs}.${finalScore.balls})`;
    // The match ends during the 2nd innings, so battingTeamId is the chasing side —
    // write its own summary field, not a hardcoded score2.
    await legendsApi.updateMatch(matchData.id, { status: 'completed', [summaryFieldFor(battingTeamId)]: scoreStr, result });
    computeMvp();
    // The MVP awards popup (fired by the matchComplete effect) now announces the
    // result — no separate native alert needed.
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
    setPendingCreaseSwap(false);   // undoing the ball cancels any deferred end-of-over swap
    if (prev.batStats) setBatStats(prev.batStats);
    if (prev.bowlStats) setBowlStats(prev.bowlStats);
    if (prev.outBatters) setOutBatters(prev.outBatters);
    // Bowling-rule state, so winding back over an over boundary restores who is
    // allowed to bowl next. Guarded: snapshots taken before this shipped won't
    // carry these keys.
    if (prev.bowlerOvers) setBowlerOvers(prev.bowlerOvers);
    if ('lastOverBowlerId' in prev) setLastOverBowlerId(prev.lastOverBowlerId);
    if ('freeHit' in prev) setFreeHit(prev.freeHit);
    if (prev.retiredBatters) setRetiredBatters(prev.retiredBatters);
    setShowPlayerModal(false);
    setShowBowlerModal(false);
    const s = `${prev.score.runs}/${prev.score.wickets} (${prev.score.overs}.${prev.score.balls})`;
    syncMatchSummary(s);
    showToast('Last ball undone', 'success');
    setUndoing(false);
  };

  // The match summary is TEAM-indexed everywhere it's displayed: score1 = team1's
  // score, score2 = team2's score (feed cards, scorecard header, teams tab). The
  // scorer, however, works innings by innings. Writing "score1 for innings 1" is
  // wrong whenever team2 bats first — its runs would land in score1 and show under
  // team1. Map the BATTING team's score onto that team's own field instead.
  const summaryFieldFor = (teamId) => (teamId && teamId === matchData?.team2Id ? 'score2' : 'score1');

  // Keep the match summary in sync on every ball so watchers (and the scorer's own
  // scorecard) always match the live score — for BOTH innings and the correct team.
  const syncMatchSummary = (scoreStr) => {
    legendsApi.updateMatch(matchData.id, { [summaryFieldFor(battingTeamId)]: scoreStr });
  };

  // addRuns = extra runs on a wide/no-ball/bye/leg-bye (e.g. wide+2, no-ball+4).
  // wicketType = dismissal kind chosen from the Wicket sheet.
  // dismissed = 'striker' | 'nonstriker' — a run-out can dismiss the non-striker.
  // catcher = fielder/keeper/bowler name for a caught dismissal (shown in scorecard).
  const handleScore = async (value, addRuns = 0, wicketType = 'bowled', dismissed = 'striker', catcher = null, penaltyReason = null) => {
    if (matchComplete || undoing) return;
    // Debounce: ignore a new tap while the previous ball is still being saved. Rapid
    // taps during the async save read a stale score and used to pile balls into one
    // over (8–12 ball overs). Real scoring is seconds apart, so this only drops
    // accidental double-taps.
    if (savingRef.current) return;
    // A wicket empties a batter slot until the replacement is picked. Don't score
    // the next ball into a missing batter (persistBall would refuse anyway) —
    // reopen the New Batsman picker instead.
    if (!striker || !nonStriker) {
      setNewBatterFor(!striker ? 'striker' : 'nonstriker');
      setShowPlayerModal(true);
      return;
    }
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
    // Snapshot the pre-ball state so this delivery can be taken back. Built
    // here, but committed only once the ball is actually stored (below) — a
    // rejected ball used to leave an undo entry for a delivery that never
    // happened, so Undo would "take back" nothing.
    const snapshot = {
      score: { ...currentScore }, over: [...currentOver], ballCount,
      striker, nonStriker, bowler: currentBowler,
      batStats: { ...batStats }, bowlStats: { ...bowlStats }, outBatters: [...outBatters],
      // The end of an over bumps the bowler's spell count and records who bowled
      // it (the no-consecutive-overs rule). Undo used to leave both advanced, so
      // winding back past an over boundary left a bowler wrongly barred, or a
      // spell over-counted — invisible until the picker refused them.
      bowlerOvers: { ...bowlerOvers }, lastOverBowlerId,
      freeHit, retiredBatters: [...retiredBatters],
    };
    // Tactile feedback: a firm buzz on a wicket, a light tick on every other ball.
    if (value === 'out') haptic.warn(); else haptic.tick();
    let newScore = { ...currentScore };
    let newOver = [...currentOver];
    // Count strike changes (batsmen crossing on odd runs + changing ends at the end
    // of an over) and apply the NET swap ONCE at the end. Doing each swap inline via
    // setState collapsed two swaps into one — both read the same closure striker/
    // nonStriker, so last-write-wins — which meant an odd run off the LAST ball of an
    // over left the wrong batter on strike (cross + change-ends should cancel), and
    // every following ball's runs were then credited to the wrong batter.
    let strikeSwaps = 0;
    const rotate = (n) => { if (n % 2 === 1) strikeSwaps += 1; };

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
      // strike change, doesn't advance the over. Awarded to the batting side.
      // The reason (e.g. "Helmet Hit") rides along in wicketAssists — a free
      // note field only ever read for wickets, so it's safe for a penalty ball.
      newScore.runs += 5;
      newOver.push('P5');
      await persistBall(0, 5, 'penalty', false, null, false, null, catcher);
    }

    // Penalty (e.g. Helmet Hit) awarded ON this delivery: the delivery above keeps
    // its own book-keeping (ball count, bowler charge, free hit); the 5 penalty
    // runs ride along as a SEPARATE team-only entry — not charged to the bowler,
    // not credited to the batter. Skipped when the delivery itself is the penalty.
    if (penaltyReason && value !== 'penalty') {
      newScore.runs += 5;
      newOver.push('P5');
      await persistBall(0, 5, 'penalty', false, null, false, null, penaltyReason);
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
      // Change ends at the end of the over. For a normal ball this is applied via
      // the net swap below; for a WICKET on the last ball the swap must wait until
      // the new batter is in, so we defer it (applied in the New Batsman modal).
      if (value === 'out') setPendingCreaseSwap(true); else strikeSwaps += 1;
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

    // Net strike change for this ball (crossings + end-of-over), applied once so
    // odd-run + over-end correctly cancels. Skipped when a wicket emptied the
    // striker slot (strikeSwaps stays even there) so the new-batter pick governs.
    if (strikeSwaps % 2 === 1) { setStriker(nonStriker); setNonStriker(striker); }
    // The ball is stored — now it's real, so it becomes undoable.
    setHistory((h) => [...h.slice(-(UNDO_DEPTH - 1)), snapshot]);
    setCurrentScore(newScore);
    const scoreStr = `${newScore.runs}/${newScore.wickets} (${newScore.overs}.${newScore.balls})`;
    syncMatchSummary(scoreStr);
    if (isInnings2) checkWinCondition(newScore);
    if (!isInnings2 && (newScore.wickets >= 10 || newScore.overs >= totalOvers && newScore.balls === 0)) {
      finishInnings(newScore.wickets >= 10 ? 'All out' : 'Overs completed', newScore);
    }
    } catch (err) {
      // The server rejected the ball. If scoring was transferred away mid-session,
      // switch straight to the live Scorecard (no alarming message); anything else
      // (e.g. a network hiccup) gets a plain, actionable alert.
      if (err.message?.includes('assigned scorer')) {
        showToast('Switched to live view', 'info', 2000);
        navigation.replace('Scorecard', { matchId: matchData.id });
      } else {
        Alert.alert('Could not score this ball', err.message || 'Please try again');
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
      // battingTeamId is still the 1st-innings batting side here (the swap is below).
      await legendsApi.updateMatch(matchData.id, { [summaryFieldFor(battingTeamId)]: s1 });
      const inn = await legendsApi.createInning(matchData.id, {
        battingTeamId: bowlingTeamId, bowlingTeamId: battingTeamId, targetScore: score.runs + 1,
      });
      // A failed create used to fall through with currentInningId = '', which
      // persistBall now rejects — so every ball of the 2nd innings would alert
      // with no way forward. Stop here instead: the 1st innings is already
      // saved, so reopening the match resumes cleanly.
      if (!inn.success) {
        Alert.alert(
          'Could not start the second innings',
          `${inn.error || 'The server rejected it.'}\n\nThe first innings is saved. Reopen the match to try again.`,
        );
        return;
      }
      setIsInnings2(true);
      setCurrentInningId(inn.data.id);
      setCurrentScore({ runs: 0, wickets: 0, overs: 0, balls: 0 });
      setCurrentOver([]); setBallCount(0); setHistory([]);
      // Fresh innings → reset per-player figures + bowling spell tracking + dismissals.
      setBatStats({}); setBowlStats({}); setBowlerOvers({}); setLastOverBowlerId(null); setOutBatters([]); setRetiredBatters([]); setPendingCreaseSwap(false);
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
    setHistory((h) => [...h.slice(-(UNDO_DEPTH - 1)), {
      score: { ...currentScore }, over: [...currentOver], ballCount,
      striker, nonStriker, bowler: currentBowler,
      batStats: { ...batStats }, bowlStats: { ...bowlStats }, outBatters: [...outBatters],
      bowlerOvers: { ...bowlerOvers }, lastOverBowlerId,
      freeHit, retiredBatters: [...retiredBatters],
    }]);
    haptic.warn();
    try {
      await persistBall(0, 0, 'retired', true, 'retiredout', false, leaving.id);
    } catch (err) {
      if (err.message?.includes('assigned scorer')) {
        showToast('Switched to live view', 'info', 2000);
        navigation.replace('Scorecard', { matchId: matchData.id });
        return;
      }
      Alert.alert('Could not save', err.message || 'Please try again');
      return;
    }
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
    const msg = `${battingTeamName} ${currentScore.runs}/${currentScore.wickets} (${overStr}) — scoring live on ${BRAND_NAME}\n${BRAND_TAGLINE}`;
    await Share.share({ message: msg });
  };

  // Transfer scoring rights to another registered player in the squad.
  const openTransferScorer = async () => {
    if (!matchData?.id) return;
    const res = await legendsApi.getScorerInfo(matchData.id);
    if (!res.success) { Alert.alert('Transfer scorer', res.error || 'Could not load'); return; }
    if (!res.candidates.length) {
      Alert.alert('Transfer scorer', 'No other registered players in this match. Add players (linked to their app accounts) first.');
      return;
    }
    setTransferCandidates(res.candidates);
    setTransferPrompt(true);
  };

  const doTransfer = (cand) => {
    Alert.alert('Transfer scoring?', `Hand scoring of this match to ${cand.name}? You will no longer be able to score it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Transfer', style: 'destructive', onPress: async () => {
        setTransferPrompt(false);
        const r = await legendsApi.transferScorer(matchData.id, cand.userId);
        if (r.success) {
          Alert.alert('Scorer transferred', `${cand.name} can now score this match from their My Matches.`, [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        } else {
          Alert.alert('Transfer failed', r.error || 'Please try again');
        }
      } },
    ]);
  };

  // Ball display in over tracker
  const renderBallDot = (b, i, isLast = false) => {
    let bg = DS.surfaceHighest;
    let color = DS.textPrimary;
    let label = b;
    const str = String(b).toLowerCase();

    if (str === '·') label = '0';

    if (str.includes('w') && !str.includes('wd')) { bg = DS.wicketBg; color = DS.wicketText; } // Wickets
    else if (str.includes('wd') || str.includes('nb')) { bg = 'rgba(255,181,158,0.15)'; color = DS.coral; } // Wides, NBs
    else if (str.includes('b')) { bg = DS.surfaceHigh; color = DS.textVariant; } // Byes / Leg Byes
    else if (str.includes('4')) { bg = DS.blue + '33'; color = DS.blue + 'ff'; } // Fours
    else if (str.includes('6')) { bg = DS.lime + '26'; color = DS.lime; } // Sixes
    else if (label === '0') { bg = DS.surfaceHighest; color = DS.textMuted; } // Dots
    else { bg = DS.surfaceHigh; color = DS.textPrimary; } // Normal runs

    // The just-recorded ball is ringed + scaled up a touch, so a tap lands with
    // clear confirmation of what went in.
    return (
      <View key={i} style={[styles.overBall, { backgroundColor: bg }, isLast && [styles.overBallLast, { borderColor: color }]]}>
        <Text style={[styles.overBallText, { color }]}>{label}</Text>
      </View>);
  };

  // Fill remaining balls as empty dots
  const filledOver = [...currentOver];
  while (filledOver.length < 6) filledOver.push(null);

  // The last delivery of the in-progress over — shown on the UNDO button so it
  // doubles as "what you just recorded / what undo will remove". Blank between
  // overs (the pick-bowler prompt covers that moment).
  const lastBall = currentOver.length
    ? (String(currentOver[currentOver.length - 1]) === '·' ? '0' : String(currentOver[currentOver.length - 1]))
    : null;

  // Display-only runs tally for the in-progress over (incl. extras) — derived
  // from currentOver locally, same parsing as the end-of-over summary; never
  // persisted, the server computes its own over totals.
  const overRunsSoFar = currentOver.reduce((acc, b) => {
    if (b === 'WD' || b === 'NB' || b === 'B' || b === 'LB') return acc + 1;
    if (b === 'P5') return acc + 5;
    if (b === '·' || b === 'W') return acc;
    const n = parseInt(b, 10);   // '2wd','3nb','2b','3lb', or plain runs
    return isNaN(n) ? acc : acc + n;
  }, 0);

  // Real bowler figures: Overs - Maidens - Runs - Wickets (O-M-R-W).
  const figFor = (id) => {
    const b = bowlStats[id] || { balls: 0, runs: 0, wickets: 0, maidens: 0 };
    return `${Math.floor(b.balls / 6)}.${b.balls % 6} - ${b.maidens} - ${b.runs} - ${b.wickets}`;
  };
  const bowlerStats = currentBowler ? figFor(currentBowler.id) : '—';

  // Who bowled the previous over — shown, quieter, under the current bowler.
  const prevBowler = lastOverBowlerId && lastOverBowlerId !== currentBowler?.id
    ? bowlingXI.find((p) => p.id === lastOverBowlerId)
    : null;

  // ── PRE-SCORING SETUP SCREEN ──────────────────────────────────
  if (!scoringReady) {
    const canStart = striker && nonStriker && currentBowler;

    
    return (
      <View style={styles.root}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />

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

          
          {/* Setup Slots Redesign */}
          <View style={setup.slotsContainer}>
            <View style={setup.batterSlots}>
              <TouchableOpacity style={setup.slotCard} activeOpacity={0.7} onPress={() => setSetupSelecting('striker')}>
                <Text style={setup.slotLabel}>STRIKER</Text>
                {striker ? (
                  <View style={setup.slotFilled}>
                    <View style={[setup.slotAvatar, { backgroundColor: DS.lime }]}><Text style={[setup.slotAvatarText, {color: DS.bg}]}>{striker.name.charAt(0)}</Text></View>
                    <Text style={setup.slotName} numberOfLines={1}>{striker.name}</Text>
                    <Icon name="cricket" size={16} color={DS.textMuted} />
                  </View>
                ) : (
                  <View style={setup.slotEmpty}><Icon name="plus" size={16} color={DS.textMuted} /><Text style={setup.slotEmptyText}>Select</Text></View>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={setup.swapBtn} activeOpacity={0.7} onPress={() => {
                const t = striker; setStriker(nonStriker); setNonStriker(t);
              }}>
                <Icon name="swap-vertical" size={20} color={DS.textPrimary} />
              </TouchableOpacity>

              <TouchableOpacity style={setup.slotCard} activeOpacity={0.7} onPress={() => setSetupSelecting('nonstriker')}>
                <Text style={setup.slotLabel}>NON-STRIKER</Text>
                {nonStriker ? (
                  <View style={setup.slotFilled}>
                    <View style={[setup.slotAvatar, { backgroundColor: DS.surfaceHighest }]}><Text style={setup.slotAvatarText}>{nonStriker.name.charAt(0)}</Text></View>
                    <Text style={setup.slotName} numberOfLines={1}>{nonStriker.name}</Text>
                    <Icon name="cricket" size={16} color={DS.textMuted} />
                  </View>
                ) : (
                  <View style={setup.slotEmpty}><Icon name="plus" size={16} color={DS.textMuted} /><Text style={setup.slotEmptyText}>Select</Text></View>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[setup.slotCard, { marginTop: 16 }]} activeOpacity={0.7} onPress={() => setSetupSelecting('bowler')}>
              <Text style={setup.slotLabel}>OPENING BOWLER</Text>
              {currentBowler ? (
                <View style={setup.slotFilled}>
                  <View style={[setup.slotAvatar, { backgroundColor: DS.coral }]}><Text style={[setup.slotAvatarText, {color: DS.bg}]}>{currentBowler.name.charAt(0)}</Text></View>
                  <Text style={setup.slotName} numberOfLines={1}>{currentBowler.name}</Text>
                  <Icon name="baseball" size={16} color={DS.textMuted} />
                </View>
              ) : (
                <View style={setup.slotEmpty}><Icon name="plus" size={16} color={DS.textMuted} /><Text style={setup.slotEmptyText}>Select Bowler</Text></View>
              )}
            </TouchableOpacity>
          </View>
          
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

      <Modal visible={!!setupSelecting} transparent animationType="slide" onRequestClose={() => setSetupSelecting(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              Select {setupSelecting === 'striker' ? 'Striker' : setupSelecting === 'nonstriker' ? 'Non-Striker' : 'Bowler'}
            </Text>
            <Text style={styles.modalSub}>
              {setupSelecting === 'bowler' ? bowlingTeamName : battingTeamName}
            </Text>
            <ScrollView style={{ maxHeight: Dimensions.get('window').height * 0.6, marginTop: 10 }}>
              {(setupSelecting === 'bowler' ? bowlingXI : battingXI).map(p => {
                // filter out already selected for the other slot
                if (setupSelecting === 'striker' && nonStriker?.id === p.id) return null;
                if (setupSelecting === 'nonstriker' && striker?.id === p.id) return null;
                
                return (
                  <TouchableOpacity key={p.id} style={setup.modalRow} onPress={() => {
                    if (setupSelecting === 'striker') setStriker(p);
                    if (setupSelecting === 'nonstriker') setNonStriker(p);
                    if (setupSelecting === 'bowler') setCurrentBowler(p);
                    setSetupSelecting(null);
                  }}>
                    <View style={setup.modalAvatar}>
                      <Text style={setup.modalAvatarText}>{p.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={setup.modalRowName}>{p.name}</Text>
                      {p.role ? <Text style={setup.modalRowRole}>{p.role}</Text> : null}
                    </View>
                    <Icon name="chevron-right" size={20} color={DS.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setSetupSelecting(null)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      </View>);

  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />

      {/* ── SCOREBOARD HEADER (compact top bar + score + this-over) ── */}
      <View style={styles.scoreboard}>
        <View style={styles.topBar}>
          <TouchableOpacity hitSlop={8} onPress={() => setShowExitModal(true)}>
            <Icon name="chevron-left" size={24} color={DS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topTeams} numberOfLines={1}>
            <Text style={styles.topTeamActive}>{shortCode(battingTeamName)}</Text>
            <Text style={styles.topVs}>  v  </Text>
            <Text style={styles.topTeamDim}>{shortCode(bowlingTeamName)}</Text>
          </Text>
          {!matchComplete &&
            <View style={styles.liveTag}><View style={styles.liveDot} /><Text style={styles.liveTagText}>LIVE</Text></View>}
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.topBarBtn} onPress={shareScore}>
            <Icon name="share-variant" size={16} color={DS.textVariant} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBarBtn} onPress={() => setShowSettings(true)}>
            <Icon name="cog-outline" size={16} color={DS.textVariant} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity activeOpacity={0.85} style={styles.sbScoreRow}
          onPress={() => matchData?.id && navigation.navigate('Scorecard', { matchId: matchData.id })}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sbTeam} numberOfLines={1}>{battingTeamName || 'Batting'}</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreMain}>{currentScore.runs}<Text style={styles.scoreWkts}>/{currentScore.wickets}</Text></Text>
              <Text style={styles.scoreOvers}> ({overStr}/{totalOvers})</Text>
            </View>
            {isInnings2 && !matchComplete &&
              <Text style={styles.sbTargetText} numberOfLines={1}>
                {battingTeamName || 'Batting'} need <Text style={styles.sbTargetNum}>{need}</Text> run{need !== 1 ? 's' : ''} off <Text style={styles.sbTargetNum}>{ballsLeft}</Text> ball{ballsLeft !== 1 ? 's' : ''}
              </Text>
            }
            {matchComplete &&
              <View style={styles.resultPill}><Text style={styles.resultText}>{matchResult}</Text></View>}
          </View>
          <View style={styles.sbRatesCol}>
            <View style={styles.sbRates}>
              <Text style={styles.sbRate}>CRR <Text style={styles.sbRateNumCrr}>{crr}</Text></Text>
              {rrr ? <Text style={styles.sbRate}>RRR <Text style={styles.sbRateNumRrr}>{rrr}</Text></Text> : null}
            </View>
            <Text style={styles.sbScorecardLink}>Scorecard ›</Text>
          </View>
        </TouchableOpacity>

        {/* ── THIS-OVER TRACKER — its own band so the ball chips get the full
            width to breathe, with the over's running runs called out in the
            sport accent. Tally is display-only (incl. extras), derived from
            currentOver; the server tracks legal balls/overs itself. ── */}
        <View style={styles.sbOverBox}>
          <View style={styles.sbOverMeta}>
            <View style={styles.overLabelWrap}>
              <View style={styles.overAccentTick} />
              <Text style={styles.overLabel}>THIS OVER</Text>
              {freeHit && <View style={styles.freeHitPill}><Text style={styles.freeHitText}>FREE HIT</Text></View>}
            </View>
            <Text style={styles.overSummary} numberOfLines={1}>
              <Text style={styles.overSummaryRuns}>{overRunsSoFar}</Text>
              <Text style={styles.overSummaryUnit}> {overRunsSoFar === 1 ? 'run' : 'runs'} · {currentOver.length} ball{currentOver.length !== 1 ? 's' : ''}</Text>
            </Text>
          </View>
          <ScrollView ref={overScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.overBalls}>
            {filledOver.map((b, i) =>
            b !== null ? renderBallDot(b, i, i === currentOver.length - 1) :
            <View key={i} style={[styles.overBall, styles.overBallEmpty]}><View style={styles.overBallDot} /></View>
            )}
          </ScrollView>
        </View>
      </View>

      <View style={styles.body}>

        {/* ── CREASE PANEL — both batters + the bowler, like a real scoreboard ── */}
        <View style={styles.creasePanel}>
          <View style={[styles.creaseRow, styles.creaseStrikerRow]}>
            {/* On-strike marker: bold name + a superscript asterisk after it
                (cricket's "on strike" notation), instead of a leading star. */}
            {striker && <PlayerAvatar name={striker.name} avatarUrl={striker.avatarUrl} size={24} style={styles.creaseAvatar} />}
            <Text style={[styles.creaseName, styles.creaseStriker]} numberOfLines={1}>
              {striker?.name || 'Select batter'}
              {striker ? <Text style={styles.strikerMark}>*</Text> : null}
            </Text>
            <Text style={[styles.creaseFig, styles.creaseFigLit]}>
              {striker ? (() => { const st = batStats[striker.id] || { runs: 0, balls: 0, fours: 0, sixes: 0 };
                return `${st.runs} (${st.balls})  ${st.fours}×4 ${st.sixes}×6`; })() : '—'}
            </Text>
          </View>

          <View style={[styles.creaseRow, styles.creaseRowDivider]}>
            {nonStriker && <PlayerAvatar name={nonStriker.name} avatarUrl={nonStriker.avatarUrl} size={24} style={styles.creaseAvatar} />}
            <Text style={styles.creaseName} numberOfLines={1}>{nonStriker?.name || '—'}</Text>
            <Text style={styles.creaseFig}>
              {nonStriker ? (() => { const st = batStats[nonStriker.id] || { runs: 0, balls: 0 };
                return `${st.runs} (${st.balls})`; })() : ''}
            </Text>
          </View>

          {/* Current bowler — emphasised (larger + full ink), no swap control. */}
          <View style={[styles.creaseRow, styles.creaseBowlerRow]}>
            {currentBowler && <PlayerAvatar name={currentBowler.name} avatarUrl={currentBowler.avatarUrl} size={24} style={styles.creaseAvatar} />}
            <Text style={[styles.creaseName, styles.creaseStriker]} numberOfLines={1}>{currentBowler?.name || 'Select bowler'}</Text>
            <Text style={[styles.creaseFig, styles.creaseFigLit]}>{bowlerStats}</Text>
          </View>

          {/* Previous over's bowler — quieter row, for at-a-glance context. */}
          {prevBowler ? (
            <View style={styles.creaseRow}>
              <PlayerAvatar name={prevBowler.name} avatarUrl={prevBowler.avatarUrl} size={24} style={styles.creaseAvatar} />
              <Text style={styles.creaseName} numberOfLines={1}>{prevBowler.name}</Text>
              <Text style={styles.creaseFig}>{figFor(prevBowler.id)}</Text>
            </View>
          ) : null}
        </View>

        {/* ── EXTRAS ROW — tap for +runs (wide 2, no-ball 4, etc.) ── */}
        {!matchComplete &&
        <View style={styles.extraRow}>
            <TouchableOpacity
              style={[styles.extraBtn, styles.undoBtn, (history.length === 0 || undoing) && { opacity: 0.4 }]}
              onPress={undoLastBall} disabled={history.length === 0 || undoing}>
              <Icon name="undo-variant" size={15} color={DS.coral} />
              <Text style={[styles.extraBtnText, styles.undoBtnText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                UNDO{lastBall ? ` ${lastBall}` : ''}
              </Text>
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
            <TouchableOpacity style={styles.extraBtn} onPress={() => setPenaltyPrompt(true)}>
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
                <Text style={[styles.gridBtnNum, { color: DS.white }]}>4</Text><Text style={[styles.gridBtnLabel, { color: 'rgba(255,255,255,0.7)' }]}>FOUR</Text>
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
          <Image source={require('../assets/icons/out.png')} style={[styles.wicketIcon, { tintColor: DS.onBlue }]} />
          <Text style={styles.wicketBtnText}>WICKET{freeHit ? ' (RUN OUT ONLY)' : ''}</Text>
        </TouchableOpacity>
        }

        {/* ── MORE OPTIONS — secondary in-play actions (Change bowler, Retire).
            Always tappable; each action inside is gated on its own. ── */}
        {!matchComplete &&
        <TouchableOpacity style={styles.changeBowlerBtn} onPress={() => setMorePrompt(true)}>
          <Icon name="dots-horizontal" size={18} color={DS.lime} />
          <Text style={styles.changeBowlerText}>MORE OPTIONS</Text>
        </TouchableOpacity>
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
              <Icon name="whatsapp" size={18} color={DS.white} />
              <Text style={[styles.completeBtnText, { color: DS.white }]}>SHARE SCORE</Text>
            </TouchableOpacity>
            <MatchPhotos matchId={matchData?.id} style={{ marginTop: 10 }} />
          </View>
        }

      </View>

      <Modal visible={showExitModal} transparent animationType="slide" onRequestClose={() => setShowExitModal(false)}>
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalSheet, { transform: [{ translateY: exitDragY }] }]}>
            <View {...exitPan.panHandlers}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Pause / Leave Match?</Text>
            </View>
            <ScrollView>
              {['Raining', 'Break', 'Lunch', 'End of Day', 'Match Abandoned'].map((reason, i) => (
                <TouchableOpacity key={i} style={styles.playerOption} onPress={() => {
                  setShowExitModal(false);
                  navigation.goBack();
                }}>
                  <Text style={[styles.playerName, { flex: 1, paddingLeft: 10 }]}>{reason}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.playerOption, { borderTopWidth: 1, borderTopColor: DS.line }]} onPress={() => setShowExitModal(false)}>
                <Icon name="close" size={20} color={DS.textMuted} />
                <Text style={[styles.playerName, { flex: 1, color: DS.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

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
                  // Place the new batter in the dismissed slot, then apply any
                  // deferred end-of-over swap — computed on locals and set once, so
                  // chained setState calls can't clobber each other (which used to
                  // drop the not-out batter and keep the dismissed one).
                  let ns = striker, nn = nonStriker;
                  if (newBatterFor === 'nonstriker') nn = p; else ns = p;
                  if (pendingCreaseSwap) { const t = ns; ns = nn; nn = t; setPendingCreaseSwap(false); }
                  setStriker(ns); setNonStriker(nn);
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
                // Only eligible bowlers, and anyone at their spell limit is excluded.
                // New over (mustPickBowler): exclude whoever bowled the last over
                // (no consecutive overs). Mid-over change: exclude the CURRENT bowler
                // (can't pick the same one) — consecutive-over rule doesn't apply
                // because it's the same over continuing.
                const eligible = bowlingXI.filter((p) =>
                  (bowlerOvers[p.id] || 0) < maxOversPerBowler &&
                  (mustPickBowler ? p.id !== lastOverBowlerId : p.id !== currentBowler?.id));
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

      {/* ── 5 PENALTY RUNS sheet — reason picker (awarded to the batting side).
          Just Helmet Hit for now; the reason is recorded on the ball. ── */}
      <Modal visible={penaltyPrompt} transparent animationType="slide" onRequestClose={() => setPenaltyPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>5 Penalty Runs</Text>
            <Text style={styles.modalSub}>Added to {battingTeamName || 'the batting team'} · doesn't count as a ball</Text>
            <TouchableOpacity style={styles.penaltyOption}
              onPress={() => { setPenaltyPrompt(false); setPenaltyDeliveryPrompt(true); }}>
              <Text style={styles.penaltyOptionEmoji}>🪖</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.penaltyOptionLabel}>Helmet Hit</Text>
                <Text style={styles.penaltyOptionSub}>Ball struck a fielding helmet left on the ground</Text>
              </View>
              <Text style={styles.penaltyOptionPlus}>+5</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalClose} onPress={() => setPenaltyPrompt(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── HELMET HIT — off which delivery? The 5 penalty runs are added on top of
          the delivery's own book-keeping (legal/bye/lb count as a ball; wd/nb don't). ── */}
      <Modal visible={penaltyDeliveryPrompt} transparent animationType="slide" onRequestClose={() => setPenaltyDeliveryPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>🪖 Helmet Hit · +5</Text>
            <Text style={styles.modalSub}>Off which delivery? The 5 penalty runs are added on top</Text>
            <View style={styles.wktChips}>
              {[
                ['Legal ball', 0, 'cricket'],
                ['Wide', 'wide', 'arrow-expand-horizontal'],
                ['No ball', 'noball', 'close-circle-outline'],
                ['Bye', 'bye', 'run'],
                ['Leg bye', 'legbye', 'shoe-print'],
              ].map(([label, val, icon]) => (
                <TouchableOpacity key={label} style={styles.wktChip}
                  onPress={() => {
                    setPenaltyDeliveryPrompt(false);
                    // bye/leg-bye default to 1 run taken; wide/no-ball add their 1;
                    // a legal ball is a dot. The +5 penalty rides along in handleScore.
                    const addRuns = (val === 'bye' || val === 'legbye') ? 1 : 0;
                    handleScore(val, addRuns, 'bowled', 'striker', null, 'Helmet Hit');
                  }}>
                  <Icon name={icon} size={20} color={DS.lime} />
                  <Text style={styles.wktChipText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setPenaltyDeliveryPrompt(false)}>
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

      {/* ── MORE OPTIONS sheet — in-play secondary actions ── */}
      <Modal visible={morePrompt} transparent animationType="slide" onRequestClose={() => setMorePrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>More Options</Text>
            {/* Change bowler — only while an over is in progress (the next-over flow
                picks the bowler once 6 legal balls are done). */}
            <TouchableOpacity
              style={[styles.settingRow, !canChangeBowler && { opacity: 0.4 }]}
              disabled={!canChangeBowler}
              onPress={() => { setMorePrompt(false); setMustPickBowler(false); setShowBowlerModal(true); }}>
              <Icon name="sync" size={20} color={DS.lime} />
              <Text style={styles.settingText}>Change bowler</Text>
              <Icon name="chevron-right" size={18} color={DS.textMuted} />
            </TouchableOpacity>
            {/* Retire a batsman (hurt → can return, or out → counts as a wicket). */}
            <TouchableOpacity
              style={[styles.settingRow, !scoringReady && { opacity: 0.4 }]}
              disabled={!scoringReady}
              onPress={() => { setMorePrompt(false); setRetiredPrompt(true); }}>
              <Icon name="bandage" size={20} color={DS.blue} />
              <Text style={styles.settingText}>Retire batsman</Text>
              <Icon name="chevron-right" size={18} color={DS.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalClose} onPress={() => setMorePrompt(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
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
              <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); openTransferScorer(); }}>
                <Icon name="account-switch" size={20} color={DS.blue} />
                <Text style={styles.settingText}>Transfer scorer</Text>
                <Icon name="chevron-right" size={18} color={DS.textMuted} />
              </TouchableOpacity>
            )}
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

      {/* ── TRANSFER SCORER — hand scoring to another registered squad member ── */}
      <Modal visible={transferPrompt} transparent animationType="slide" onRequestClose={() => setTransferPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Transfer Scorer</Text>
            <Text style={styles.modalSub}>They'll be able to resume &amp; score from their My Matches</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {transferCandidates.map((cand) => (
                <TouchableOpacity key={cand.userId} style={styles.playerOption} onPress={() => doTransfer(cand)}>
                  <View style={[styles.playerAvatar, { backgroundColor: DS.blue + '33' }]}>
                    <Text style={[styles.playerInitial, { color: DS.blue }]}>{(cand.name || '?').charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.playerName, { flex: 1 }]}>{cand.name}</Text>
                  <Icon name="account-switch" size={18} color={DS.blue} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setTransferPrompt(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
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

      {/* Post-match awards (MVP) — shown to the scorer, then → Home feed */}
      <MatchAwardsModal
        visible={showAwards}
        loading={awardsLoading}
        awards={awards}
        result={matchResult}
        onClose={closeAwards}
      />
    </View>);

}

const GRID_BTN = (width - 48) / 3;

const makeStyles = (DS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },
  // No-scroll: the content column fills the space between the scoreboard header
  // and tab bar; the scoring grid flexes to take whatever's left.
  body: { flex: 1, paddingTop: 8 },
  topBarRight: { flexDirection: 'row', gap: 8 },
  topBarBtn: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

  // ── Scoreboard header — compact top bar + score + this-over ──
  scoreboard: {
    backgroundColor: DS.surfaceLow, paddingTop: 42, paddingHorizontal: 16, paddingBottom: 9,
    borderBottomWidth: 1, borderBottomColor: DS.line,
  },
  // Compact top bar: back · teams · LIVE · actions
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  topTeams: { fontSize: 13, letterSpacing: 0.5 },
  topTeamActive: { color: DS.textPrimary, fontWeight: '900' },
  topVs: { color: DS.textMuted, fontSize: 11, fontWeight: '700' },
  topTeamDim: { color: DS.textMuted, fontWeight: '800' },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: DS.live },
  liveTagText: { fontSize: 9, fontWeight: '900', color: DS.live, letterSpacing: 0.6 },

  sbScoreRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sbTeam: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 1 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end' },
  scoreMain: { fontSize: 40, fontWeight: '900', color: DS.textPrimary, letterSpacing: -1.2, lineHeight: 42 },
  scoreWkts: { color: DS.textMuted },
  scoreOvers: { fontSize: 16, color: DS.textMuted, fontWeight: '700', marginBottom: 5, marginLeft: 4 },
  sbRatesCol: { alignItems: 'flex-end', gap: 4, marginTop: 3 },
  sbRates: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sbRate: { fontSize: 11.5, fontWeight: '700', color: DS.textMuted },
  sbRateNumCrr: { color: DS.lime, fontWeight: '900' },
  sbRateNumRrr: { color: DS.coral, fontWeight: '900' },
  sbScorecardLink: { fontSize: 11.5, fontWeight: '800', color: DS.blue },
  sbTargetText: { fontSize: 13, fontWeight: '600', color: DS.coral, marginTop: 4 },
  sbTargetNum: { fontWeight: '900', color: DS.coral },
  resultPill: { marginTop: 8, backgroundColor: DS.lime, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start' },
  resultText: { fontSize: 12, fontWeight: '800', color: DS.bg },

  // "This over" tracker band — meta line (label + running runs) over a
  // full-width chips row.
  sbOverBox: {
    marginTop: 10, backgroundColor: DS.surface, borderRadius: 12,
    borderWidth: 1, borderColor: DS.line, paddingTop: 7, paddingBottom: 8, paddingHorizontal: 10, gap: 8,
  },
  sbOverMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  overAccentTick: { width: 3, height: 11, borderRadius: 2, backgroundColor: DS.lime },
  overLabel: { fontSize: 10, fontWeight: '800', color: DS.textVariant, letterSpacing: 1.1 },
  overSummary: { flexShrink: 1, textAlign: 'right' },
  overSummaryRuns: { fontSize: 14, fontWeight: '900', color: DS.lime, letterSpacing: -0.2 },
  overSummaryUnit: { fontSize: 10.5, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.2 },

  // ── Crease panel — striker (lit) / non-striker / bowler ──
  creasePanel: { backgroundColor: DS.surfaceHigh, borderRadius: 16, marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 2, marginBottom: 6 },
  creaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  // On-strike batter is lifted with a faint lime wash + rounded ends so the eye
  // lands on who's facing without reading names.
  creaseStrikerRow: { backgroundColor: DS.lime + '14', borderRadius: 10, marginHorizontal: -6, paddingHorizontal: 6 },
  creaseAvatar: { marginLeft: -2 },
  creaseRowDivider: { paddingTop: 3 },
  creaseBowlerRow: { borderTopWidth: 1, borderTopColor: DS.line },
  // The bundled font is single-weight (see res/font/selawik.xml — every weight
  // maps to Regular), so "bold" can't come from fontWeight. The striker is
  // emphasised the way the rest of the app does it — larger + full-ink — while
  // the non-striker/bowler sit smaller + muted. Explicit lineHeight so the row
  // can't clip the name's ascenders.
  creaseName: { flex: 1, fontSize: 13.5, lineHeight: 20, color: DS.textMuted },
  creaseStriker: { flex: 1, fontSize: 16, lineHeight: 22, color: DS.textPrimary },
  // Superscript "on strike" asterisk: smaller than the name and lime; the '*'
  // glyph already sits high in the line box, so a smaller one reads as a raised
  // exponent (like x² / x³) after the name.
  strikerMark: { fontSize: 11, fontWeight: '900', color: DS.lime },
  creaseFig: { fontSize: 12.5, fontWeight: '800', color: DS.textMuted, marginRight: 4 },
  creaseFigLit: { color: DS.lime },

  // Extra action row
  extraRow: { flexDirection: 'row', gap: 6, marginHorizontal: 16, marginBottom: 6 },
  extraBtn: {
    flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 11, paddingVertical: 8,
    alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1, borderColor: DS.line,
  },
  extraBtnText: { fontSize: 10.5, fontWeight: '800', color: DS.textVariant, letterSpacing: 0.3, textAlign: 'center' },
  // UNDO is a correction control, not an extra — coral-tinted so it reads apart
  // from the neutral WD/NB/BYE/LB buttons beside it, and its label carries the
  // last delivery (what it will remove).
  undoBtn: { flex: 1.6, flexDirection: 'row', gap: 4, paddingHorizontal: 4, backgroundColor: DS.coral + '14', borderColor: DS.coral + '55' },
  undoBtnText: { color: DS.coral },

  // Full-width wicket button
  wicketBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 6, backgroundColor: DS.coral, borderRadius: 15, paddingVertical: 13,
  },
  wicketBtnText: { fontSize: 13, fontWeight: '900', color: DS.onBlue, letterSpacing: 2 },
  wicketIcon: { width: 22, height: 22, resizeMode: 'contain' },

  // Change Bowler — slim secondary button under WICKET, always shown.
  changeBowlerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginHorizontal: 16, marginBottom: 6, paddingVertical: 10, borderRadius: 12,
    backgroundColor: DS.lime + '14', borderWidth: 1, borderColor: DS.lime + '44',
  },
  changeBowlerText: { fontSize: 12, fontWeight: '900', color: DS.lime, letterSpacing: 1.5 },

  // Penalty-reason option (5 Penalty Runs sheet)
  penaltyOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: DS.surfaceHigh,
    borderRadius: 14, borderWidth: 1, borderColor: DS.line, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 4,
  },
  penaltyOptionEmoji: { fontSize: 22 },
  penaltyOptionLabel: { fontSize: 15, fontWeight: '800', color: DS.textPrimary },
  penaltyOptionSub: { fontSize: 11, fontWeight: '600', color: DS.textMuted, marginTop: 2 },
  penaltyOptionPlus: { fontSize: 17, fontWeight: '900', color: DS.lime },

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
  grid: { flex: 1, marginHorizontal: 16, gap: 9, marginBottom: 9, minHeight: 132 },
  gridRow: { flex: 1, flexDirection: 'row', gap: 9 },
  gridBtn: {
    flex: 1, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', gap: 2
  },
  gridBtnDot: { backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.line },
  gridBtnFour: { backgroundColor: DS.blueDeep },
  gridBtnSix: { backgroundColor: DS.lime + '24', borderWidth: 1, borderColor: DS.lime + '44' },
  gridBtnWide: { backgroundColor: 'rgba(255,181,158,0.1)' },
  gridBtnWicket: { backgroundColor: DS.wicketBg },
  gridBtnNum: { fontSize: 28, fontWeight: '900', color: DS.textPrimary, letterSpacing: -1 },
  gridBtnLabel: { fontSize: 9.5, fontWeight: '800', color: DS.textMuted, letterSpacing: 1 },
  gridBtnWideText: { color: DS.coral },

  // Over tracker
  overSection: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 8
  },
  overSectionLabel: { fontSize: 18, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.8 },
  freeHitPill: { backgroundColor: DS.limeBright, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'center' },
  freeHitText: { fontSize: 9, fontWeight: '900', color: DS.bg, letterSpacing: 0.8 },
  overBalls: { flexDirection: 'row', gap: 5 },
  overBall: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  // Latest delivery: a coloured ring + slight scale, as tap confirmation.
  overBallLast: { borderWidth: 2, transform: [{ scale: 1.12 }] },
  overBallEmpty: { backgroundColor: DS.surfaceHighest, borderWidth: 1, borderColor: DS.line },
  overBallDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: DS.surfaceHighest },
  overBallText: { fontSize: 14, fontWeight: '800' },

  // Momentum bar
  momentumSection: { marginHorizontal: 16, marginBottom: 12 },
  momentumBar: { height: 6, backgroundColor: DS.surfaceHigh, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  momentumFill: { height: '100%', backgroundColor: DS.lime, borderRadius: 3 },
  momentumLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  momentumLabelLeft: { fontSize: 9, fontWeight: '700', color: DS.lime, letterSpacing: 0.8 },
  momentumLabelRight: { fontSize: 9, fontWeight: '700', color: DS.coral, letterSpacing: 0.8 },

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
  modalOverlay: { flex: 1, backgroundColor: DS.overlay, justifyContent: 'flex-end' },
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
  slotsContainer: { paddingHorizontal: 16, marginTop: 10 },
  batterSlots: { flexDirection: 'column', gap: 12 },
  slotCard: {
    backgroundColor: DS.surfaceLow, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: DS.border
  },
  slotLabel: { fontSize: 10, fontWeight: '800', color: DS.textVariant, letterSpacing: 1, marginBottom: 10 },
  slotEmpty: { flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.7 },
  slotEmptyText: { fontSize: 14, color: DS.textMuted, fontWeight: '600' },
  slotFilled: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slotAvatar: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  slotAvatarText: { fontSize: 14, fontWeight: '800', color: DS.textPrimary },
  slotName: { flex: 1, fontSize: 15, fontWeight: '700', color: DS.textPrimary },
  swapBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: DS.surfaceHighest,
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
    alignSelf: 'center', marginTop: -20, marginBottom: -20,
    borderWidth: 1, borderColor: DS.border
  },
  modalRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: DS.border
  },
  modalAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: DS.surfaceHighest,
    alignItems: 'center', justifyContent: 'center', marginRight: 12
  },
  modalAvatarText: { fontSize: 16, fontWeight: '800', color: DS.textPrimary },
  modalRowName: { fontSize: 15, fontWeight: '700', color: DS.textPrimary },
  modalRowRole: { fontSize: 11, color: DS.textMuted, marginTop: 2 },
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
    backgroundColor: DS.lime + '14', borderRadius: 12, padding: 12, marginBottom: 8
  },
  inningsText: { fontSize: 14, fontWeight: '700', color: DS.lime },

  section: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 14, marginBottom: 4 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 1.5, marginBottom: 12 },
  playerRow: { flexDirection: 'row', gap: 10, paddingRight: 8 },
  playerChip: {
    alignItems: 'center', gap: 6, padding: 10,
    backgroundColor: DS.surfaceLow, borderRadius: 14, minWidth: 72
  },
  playerChipActive: { backgroundColor: DS.lime + '14', borderWidth: 1.5, borderColor: DS.lime },
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