import { useTheme, useThemedStyles } from "../theme/ThemeContext";import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Modal, Share, StatusBar, Dimensions, BackHandler,
  Animated, PanResponder } from
'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { sortSquad } from '../utils/squadOrder';
import legendsApi from '../services/LegendsApi';
import { haptic } from '../utils/haptics';
import { activateKeepAwake, deactivateKeepAwake } from '../utils/keepAwake';
import { showToast } from '../components/Toast';
import InningsBreakScreen from '../components/InningsBreakScreen';
import MatchPhotos from '../components/MatchPhotos';
import MatchAwardsModal from "../components/MatchAwardsModal";
import BallIntelligenceSheet from "../components/BallIntelligenceSheet";
import { enqueueShot, loadShotQueue, flushShotQueue, setShotDropHandler } from '../utils/shotQueue';
import { handOf } from '../sports/cricket/wagonWheel';
import { cricketColors } from '../theme/cricketColors';
import { isBowlerWicket } from '../utils/cricketRules';
import PlayerAvatar from "../components/PlayerAvatar";
import { BRAND_NAME, BRAND_TAGLINE } from "../components/BrandLogo";
import {
  resolveRunOut, resolveEnds, overRuns, isWicketChip, ballChip,
  DELIVERY, RUNS, END,
} from '../utils/runOutEngine';

const { width } = Dimensions.get('window');

// Team runs off an over, read back from its chip labels (incl. extras). Display
// only — the server computes its own over totals. Shared by the THIS OVER tally
// and the over-complete sheet so the two can't disagree. Lives with the notation
// it parses (runOutEngine's ballChip), so the two can't drift apart.
const runsInOver = overRuns;

// Does a squad role mark this player as the wicket-keeper? The role string is
// free text across the app and the seeds ('Wicket-keeper', 'Wicketkeeper',
// 'Keeper', 'WK'), so match loosely rather than on one exact spelling.
const isKeeperRole = (role) => {
  const r = String(role || '').trim();
  return /keep/i.test(r) || /^wk$/i.test(r);
};
















// Remembered per device: a scorer who scores in the sun scores in the sun again.
const SUN_KEY = 'cricket.sunlightScoring';

export default function ScoringScreen({ route, navigation }) {const { colors: DS, isDark, mode: themeMode, setMode } = useTheme();const styles = useThemedStyles(makeStyles);const setup = useThemedStyles(makeSetup);
  const { match, resume, matchId: resumeId } = route.params || {};
  const [matchData, setMatchData] = useState(match || {});

  useLayoutEffect(() => {
    // Full-screen console — hide the stack "Scoring" header; the scoreboard's own
    // back button + brand replace it, reclaiming the top of the screen.
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // ── Sunlight mode ─────────────────────────────────────────────────────────
  // A scoring-console mode, NOT an app theme. It is turned on because the scorer
  // is standing in direct sun holding the phone for three hours; the feed and
  // profile they open afterwards should look the way they always do. So the
  // preference lives here and the palette is applied only while this screen is
  // focused — leaving restores whatever theme the app was on, coming back
  // re-applies it. That is why this is a ref-and-listener dance rather than a
  // plain `setMode('sunlight')`: the mode has to be borrowed, not adopted.
  const [sunOn, setSunOn] = useState(false);
  const sunOnRef = useRef(false);
  const themeModeRef = useRef(themeMode);
  const baseModeRef = useRef(null);   // the theme to hand back on the way out
  themeModeRef.current = themeMode;

  const applySun = useCallback((on) => {
    if (on) {
      // Capture the real theme once. Re-capturing on a second call would record
      // 'sunlight' as the base and strand the user in it.
      if (baseModeRef.current == null && themeModeRef.current !== 'sunlight') {
        baseModeRef.current = themeModeRef.current;
      }
      setMode('sunlight');
    } else {
      if (baseModeRef.current) setMode(baseModeRef.current);
      baseModeRef.current = null;
    }
  }, [setMode]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SUN_KEY).then((v) => {
      if (!alive || v !== '1') return;
      setSunOn(true);
      sunOnRef.current = true;
      applySun(true);
    }).catch(() => {});
    return () => {
      alive = false;
      // Unmount must always hand the theme back, even if the screen is being
      // torn down by a match ending rather than by a back press.
      if (baseModeRef.current) setMode(baseModeRef.current);
    };
  }, [applySun, setMode]);

  useEffect(() => {
    // Blur restores but deliberately KEEPS baseModeRef, so a return to the
    // console re-applies sunlight without asking again.
    const off = navigation.addListener('blur', () => {
      if (sunOnRef.current && baseModeRef.current) setMode(baseModeRef.current);
    });
    const on = navigation.addListener('focus', () => {
      if (sunOnRef.current) setMode('sunlight');
    });
    return () => { off(); on(); };
  }, [navigation, setMode]);

  const toggleSunlight = useCallback(() => {
    haptic.tick();
    const next = !sunOnRef.current;
    sunOnRef.current = next;
    setSunOn(next);
    AsyncStorage.setItem(SUN_KEY, next ? '1' : '0').catch(() => {});
    applySun(next);
  }, [applySun]);

  const [currentScore, setCurrentScore] = useState({ runs: 0, wickets: 0, overs: 0, balls: 0 });
  const [firstInningsScore, setFirstInningsScore] = useState({ runs: 0, wickets: 0, overs: 0 });
  const [striker, setStriker] = useState(null);
  const [nonStriker, setNonStriker] = useState(null);
  // Current partnership: team runs when this pair came together, + legal balls
  // they've faced since. Runs = currentScore.runs - pnrStartRuns. Reset on each
  // new batter (a wicket ends the stand).
  const [pnrStartRuns, setPnrStartRuns] = useState(0);
  const [pnrBalls, setPnrBalls] = useState(0);
  const [currentBowler, setCurrentBowler] = useState(null);
  const [currentOver, setCurrentOver] = useState([]);
  // The over that just finished, kept on screen (as "LAST OVER") until the next
  // ball is bowled — otherwise the strip blanks the instant an over ends and the
  // scorer can't see, or confirm an undo of, that over's final ball.
  const [lastOverBalls, setLastOverBalls] = useState([]);
  const [isInnings2, setIsInnings2] = useState(false);
  // The innings break. Set when the 1st innings ends, cleared when the scorer
  // chooses to carry on — it's what the break screen renders from, and it has to
  // be captured BEFORE finishInnings resets batStats/bowlStats for the 2nd.
  const [inningsBreak, setInningsBreak] = useState(null);
  // The state as it stood the instant before the first innings was ended, so an
  // accidental end can be walked back. See resumeFirstInnings.
  const undoInningsRef = useRef(null);
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
  // bowlerId -> the over number they last finished. Powers the bowler picker's
  // order: picking for over 3, over 2's bowler is barred by the no-consecutive
  // rule, so over 1's bowler is the one you almost always want — and they were
  // sitting wherever the XI happened to list them.
  const [bowlerLastOver, setBowlerLastOver] = useState({});
  // Real per-player figures for the live cards (not team totals):
  //   batStats:  playerId -> { runs, balls, fours, sixes }
  //   bowlStats: playerId -> { balls, runs, wickets, maidens, overRuns }
  const [batStats, setBatStats] = useState({});
  const [bowlStats, setBowlStats] = useState({});
  const [extraPrompt, setExtraPrompt] = useState(null);    // 'wide'|'noball'|'bye'|'legbye' → +runs sheet
  // Runs the 0/1/2/3/4/6 pad can't express — 5 off the bat (batters run one, the
  // throw goes to the boundary) and 7. Reached by long-pressing any run button,
  // or from More Options. Without it these get fudged into a wrong figure.
  const [runsPrompt, setRunsPrompt] = useState(false);
  const [wicketPrompt, setWicketPrompt] = useState(false); // WICKET → dismissal-type sheet
  const [penaltyPrompt, setPenaltyPrompt] = useState(false); // PEN 5 → reason sheet (Helmet Hit)
  const [penaltyDeliveryPrompt, setPenaltyDeliveryPrompt] = useState(false); // after Helmet Hit → which delivery?
  // ── Run out — four questions, asked in the order a scorer sees them happen.
  // A run out is the only dismissal that can arrive on ANY delivery (legal, wide,
  // no ball, or before the ball is even bowled) and the only one where runs are
  // scored on the ball that took the wicket — so it can't be recorded from a
  // dismissal type alone. The answers gather in one draft and are resolved by
  // src/utils/runOutEngine.js when the last sheet commits.
  const [runOutDeliveryPrompt, setRunOutDeliveryPrompt] = useState(false); // 1 · what was bowled + runs completed
  const [runOutPrompt, setRunOutPrompt] = useState(false);                 // 2 · which batter is out?
  const [runOutEndPrompt, setRunOutEndPrompt] = useState(false);           // 3 · which end did the wicket fall at?
  const [runOutFielderPrompt, setRunOutFielderPrompt] = useState(false);   // 4 · which fielder?
  const [runOutDraft, setRunOutDraft] = useState(null);
  // Direct hit? Asked on the fielder sheet rather than as a fifth question —
  // the flow is already four deep, and the scorer is looking at the fielders
  // when they remember how it happened. Defaults to off: a shy of the stumps
  // relay is the common run out, and a direct hit is the thing worth claiming.
  const [runOutDirectHit, setRunOutDirectHit] = useState(false);

  // ── Dropped catch — three questions, then the runs, which commits the ball.
  // A drop is not a wicket and scores nothing: CricHeroes' algorithm has no
  // notion of a chance missed, and every update they've published has REMOVED a
  // penalty rather than added one. This is a record, so the commentary can say
  // it happened and the spectator knows why the batter is still there.
  const [dropFielderPrompt, setDropFielderPrompt] = useState(false);   // 1 · who put it down?
  const [dropDifficultyPrompt, setDropDifficultyPrompt] = useState(false); // 2 · sitter or screamer?
  const [dropRunsPrompt, setDropRunsPrompt] = useState(false);         // 3 · runs off the ball → commits
  const [dropDraft, setDropDraft] = useState(null);                    // { by, difficulty }
  const [catchPrompt, setCatchPrompt] = useState(false);   // caught → who took the catch?
  // Caught behind credits the fielding side's keeper without hunting the fielder
  // list. The keeper is read off the XI roles; when the XI doesn't name one the
  // scorer picks them once and that choice sticks for the innings.
  const [keeperPrompt, setKeeperPrompt] = useState(false); // caught behind → who's keeping?
  const [stumpDeliveryPrompt, setStumpDeliveryPrompt] = useState(false); // stumped → off what?
  const [keeperId, setKeeperId] = useState(null);          // scorer-picked keeper for the bowling side
  // Why the keeper sheet is open: 'catch' | 'stumped' | 'change'. A ref, not
  // state — it's read inside the sheet's own handlers, and a re-render between
  // opening and tapping would be a race for something this small.
  const keeperFor = useRef('catch');
  // teamId → the keeper that side named at the toss. Not one value: the second
  // innings puts the other team in the field, and their keeper is a different
  // person. Only a starting point — `keeperId` is the scorer's live answer and
  // always wins.
  const tossKeepers = useRef({});
  // Which delivery a pending stumping came off, held across the keeper sheet.
  const stumpExtra = useRef(null);
  // Armed-but-not-recorded catcher — { kind: 'cb'|'keeper'|'fielder', name, id }.
  // Same arm-then-confirm as the batter/bowler pickers: a wicket against the wrong
  // fielder can only be taken back by undoing the whole delivery.
  const [pendingCatcher, setPendingCatcher] = useState(null);
  const [newBatterFor, setNewBatterFor] = useState('striker'); // which crease slot the new batter fills
  // Tapping a name in the batsman/bowler pickers only ARMS the pick — it's committed
  // by the "Continue scoring" button. A single stray tap in a scrolling list used to
  // put the wrong player on the crease (or the wrong bowler on for the over) with no
  // clean way back, so the pick now gets a confirmation step.
  const [pendingBatter, setPendingBatter] = useState(null);
  const [pendingBowler, setPendingBowler] = useState(null);
  // Same arm-then-confirm for the two actions UNDO can't take back: ending the
  // innings/match, and retiring a batter out (a wicket) vs hurt (not out).
  const [pendingEndReason, setPendingEndReason] = useState(null);
  const [pendingRetireKind, setPendingRetireKind] = useState(null);   // 'hurt' | 'out'
  // Between-overs break: a snapshot of the over that just closed (its chips can't
  // be read live — currentOver is cleared the moment the over ends).
  const [overComplete, setOverComplete] = useState(null);
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
  const [shortRunPrompt, setShortRunPrompt] = useState(false); // "Short Run?" confirm dialog
  const [lastBallShort, setLastBallShort] = useState(false);   // last ball already docked → block a second short run
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
  // Per-ball sync state, surfaced to the scorer. Every delivery is a blocking
  // server write, so success used to be silent and failure a blocking alert —
  // the scorer had no standing answer to "did that ball actually go through?".
  // 'saving' also explains the dead moment while savingRef is dropping taps.
  const [syncState, setSyncState] = useState({ status: 'idle', error: null }); // idle|saving|synced|failed
  const retryRef = useRef(null);     // args of the ball that failed, so Retry can replay it
  // Idempotency base for the delivery in flight, HELD ACROSS RETRIES: a ball the
  // server stored but whose response was lost must dedupe on retry (the server
  // matches on clientEventId) instead of being counted twice.
  // `done` marks which of this delivery's writes already landed, so a Retry that
  // follows a PARTIAL failure (delivery stored, its penalty rejected) re-sends
  // only the missing one instead of leaning on server-side dedupe.
  const idemRef = useRef({ base: null, n: 0, done: {} });

  // ── Ball Intelligence ──────────────────────────────────────────────────────
  // Chosen at the toss and stored on the match, so it comes back on resume via
  // /live-state rather than living only in this navigation param.
  const [biEnabled, setBiEnabled] = useState(!!matchData?.ballIntelligenceEnabled);
  // "Pause" is deliberately local and NOT persisted: it means "not for the next
  // few balls, I'm busy", which is a state of the scorer, not of the match.
  const [biPaused, setBiPaused] = useState(false);
  // The delivery waiting to be asked about. Held as data rather than shown
  // immediately so it can queue behind the new-batter / new-bowler prompts
  // instead of stacking a second modal on top of them.
  const [pendingShot, setPendingShot] = useState(null);
  // The last delivery that COULD carry a shot, kept after its sheet is dismissed
  // so it can be reopened. The realistic correction is "I tapped the wrong wedge
  // and closed it" — without this the only way to fix a shot was to undo a
  // perfectly good ball and rescore it. Re-recording upserts onto the same
  // delivery, so correcting is the same write as capturing.
  const [lastShot, setLastShot] = useState(null);

  // Flush anything left over from a previous session — a scorer who lost signal
  // and closed the app still has shots sitting in the queue.
  useEffect(() => { loadShotQueue().then(() => flushShotQueue()); }, []);

  // Say something ONCE if shots are being thrown away for a reason the scorer
  // could act on. Once, not per ball: if the session has expired, every
  // remaining delivery will fail the same way, and a toast per ball would bury
  // the scoring screen under a warning they have already read. The wording says
  // what is safe — the score itself is never at risk here — because the point
  // is to stop them capturing into a void, not to make them doubt the match.
  const shotWarnedRef = useRef(false);
  useEffect(() => {
    setShotDropHandler((res) => {
      if (shotWarnedRef.current) return;
      shotWarnedRef.current = true;
      showToast(`Shots aren't being saved — ${res?.error || 'the server refused them'}. Scoring is unaffected.`, 'error', 4000);
    });
    return () => setShotDropHandler(null);
  }, []);

  const milestoneRef = useRef({ bat: {}, bowl: {}, streak: { id: null, n: 0 } });   // announced milestones + hat-trick streak
  // A COPY, for snapshots. `streak` is mutated in place as wickets fall, so
  // storing the ref itself hands a snapshot something that keeps changing under
  // it — which is what the innings-undo path was doing: it saved
  // milestoneRef.current and restored it, i.e. restored the object to itself.
  const copyMilestones = () => ({
    bat: { ...milestoneRef.current.bat },
    bowl: { ...milestoneRef.current.bowl },
    streak: { ...milestoneRef.current.streak },
  });
  const overScrollRef = useRef(null);   // "this over" tracker — auto-scrolled to the latest ball

  // Keep the just-scored ball in view: once an over runs past 6 balls (wides/
  // no-balls) or the strip overflows the header width, scroll to the end so the
  // current delivery is always visible without a manual swipe.
  useEffect(() => {
    overScrollRef.current?.scrollToEnd({ animated: true });
  }, [currentOver, lastOverBalls]);

  // Disarm on close. The pickers are also closed from elsewhere (match end, undo,
  // the hardware back button), so clearing only in the Cancel/Confirm handlers
  // would leave a stale pick armed the next time one opens.
  useEffect(() => { if (!showPlayerModal) setPendingBatter(null); }, [showPlayerModal]);
  useEffect(() => { if (!showBowlerModal) setPendingBowler(null); }, [showBowlerModal]);
  // Hold the screen on for the live session only. A scorer watches far longer
  // than they tap, so the lock timeout kept firing between balls and every
  // delivery cost an unlock. Released on unmount and the moment the match ends,
  // so nothing else in the app pays for it.
  useEffect(() => {
    if (scoringReady && !matchComplete) activateKeepAwake();
    else deactivateKeepAwake();
    return deactivateKeepAwake;
  }, [scoringReady, matchComplete]);

  useEffect(() => { if (!endPrompt) setPendingEndReason(null); }, [endPrompt]);
  useEffect(() => { if (!retiredKindPrompt) setPendingRetireKind(null); }, [retiredKindPrompt]);

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
      routes: [{ name: 'Feed' }],
    });
  };

  useEffect(() => {
    if (matchData) {
      setBattingTeamName(matchData.battingTeamName || '');
      setBowlingTeamName(matchData.bowlingTeamName || '');
      // Sorted once, here, rather than at each of the pickers that read them:
      // captain, vice, keepers, batters, all-rounders, bowlers. The batting XI
      // is a SQUAD list in the pickers — who is available to come in — not a
      // batting order, so the same rule applies to both.
      setBattingXI(sortSquad(matchData.battingXI || []));
      setBowlingXI(sortSquad(matchData.bowlingXI || []));
      tossKeepers.current = {
        [matchData.team1Id]: matchData.team1KeeperId || null,
        [matchData.team2Id]: matchData.team2KeeperId || null,
      };
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

  // ── Apply a server live-state projection to the entire scoring surface.
  // Shared by TWO callers that need to rebuild identical state from the DB:
  // resuming a match on a fresh mount, and Undo once the in-memory snapshot
  // stack is exhausted (see undoLastBall — that's what lets Undo keep walking
  // back through an innings scored in an earlier session).
  const applyLiveState = (d, mode = 'resume') => {
      setMatchData({
        id: d.matchId, overs: String(d.totalOvers), sport: 'cricket',
        battingTeamName: d.battingTeam, bowlingTeamName: d.bowlingTeam,
        battingXI: d.battingXI, bowlingXI: d.bowlingXI,
        battingTeamId: d.battingTeamId, bowlingTeamId: d.bowlingTeamId,
        // team1/team2 identity is needed to map the batting score onto the correct
        // summary field (score1 = team1, score2 = team2) on resume too.
        team1Id: d.team1, team2Id: d.team2,
        firstInningId: d.inningId,
        ballIntelligenceEnabled: d.ballIntelligenceEnabled,
      });
      // The flag lives on the match, so reopening the app mid-innings restores
      // the shot prompt instead of silently dropping the rest of the wheel.
      setBiEnabled(!!d.ballIntelligenceEnabled);
      setIsInnings2(!!d.isInnings2);
      if (d.isInnings2 && d.target) setFirstInningsScore({ runs: d.target - 1, wickets: 0, overs: 0 });
      setCurrentScore({ runs: d.totalRuns, wickets: d.wickets, overs: d.completedOvers, balls: d.ballInOver });
      // Partnership isn't persisted ball-by-ball; anchor it to the rebuilt total so
      // it reads 0 (0) now and grows from here. Self-corrects on the next wicket.
      setPnrStartRuns(d.totalRuns || 0);
      setPnrBalls(0);
      setBallCount(d.ballInOver || 0);
      setCurrentOver(d.currentOverBalls || []);
      // Live-state doesn't carry the previous over's balls, so the "LAST OVER"
      // view isn't reconstructable across a resume/server-undo — clear it.
      setLastOverBalls([]);
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
      // Undo winds back to its own toast; only resume announces itself. If undoing
      // emptied the crease (back past the first ball, or past a wicket), the same
      // "confirm the players" path applies — the crease genuinely isn't knowable.
      if (mode === 'resume') {
        showToast(fullyKnown ? 'Resumed scoring' : 'Resumed — confirm the players', 'success', 1600);
      } else if (!fullyKnown) {
        showToast('Undone — confirm the players', 'success', 1600);
      }
      return fullyKnown;
  };

  // ── Resume an in-progress match: rehydrate the full scoring state from the
  // server (Module 7 live-state projection) and skip the toss/setup screen.
  useEffect(() => {
    if (!resume || !resumeId) return;
    (async () => {
      const res = await legendsApi.getLiveState(resumeId);
      const d = res.data;
      if (!res.success || !d?.resumable) { showToast('Could not resume this match', 'error'); return; }
      applyLiveState(d, 'resume');
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
  // Undo reaches back to the first ball of the INNINGS, not just this session.
  // With a snapshot we restore locally; without one (post-resume) we let the
  // server delete the ball and rebuild from its projection. So the button is live
  // whenever the innings has had any delivery at all — a lone wide leaves
  // ballsBowled at 0 but puts a run on the board, hence the runs/wickets checks.
  const inningsHasBalls = ballsBowled > 0 || currentScore.runs > 0 || currentScore.wickets > 0;
  const canUndo = !matchComplete && (history.length > 0 || inningsHasBalls);

  // Is a delivery still being written? handleScore and undoLastBall BOTH ignore
  // taps while one is, and until now they did it invisibly: on a slow ground
  // network the scorer pressed FOUR, nothing happened, and the only clue was a
  // small SAVING pill in a different band of the screen. So they pressed it
  // again, and wondered whether they had just scored eight.
  //
  // This changes no behaviour — those taps were already being dropped. It makes
  // the drop legible, which is the difference between a moment's wait and
  // losing confidence in the app mid-over.
  const saving = syncState.status === 'saving';
  const crr = ballsBowled > 0 ? (currentScore.runs / (ballsBowled / 6)).toFixed(2) : '0.00';
  const rrr = isInnings2 && ballsLeft > 0 ? (need / (ballsLeft / 6)).toFixed(2) : null;
  // Where this innings lands if the current rate holds. 1st innings only: in a
  // chase the target is what matters, and it already sits in the chase pill.
  const projected = !isInnings2 && ballsBowled > 0
    ? Math.round(currentScore.runs + (currentScore.runs / ballsBowled) * (totalOvers * 6 - ballsBowled))
    : null;

  // Strike rate / economy — the two figures a captain asks for mid-over, and the
  // only ones the crease panel was missing.
  // (economy rides along in figFor below, where the bowler's figures are built)
  const srOf = (id) => {
    const s = batStats[id];
    return s?.balls ? ((s.runs / s.balls) * 100).toFixed(0) : null;
  };

  // countsAsBall=false for penalty runs — they're a team award, not a delivery,
  // so the over/ball count must not advance.
  // Throws if the server rejects the ball (e.g. 403 — not the assigned scorer) so
  // callers stop mutating local state instead of silently drifting from the server.
  //
  // EVERY persistBall caller must open an idempotency scope first (a Retry reuses
  // the open one instead of starting a new one). Reusing a finished scope would
  // hand out a clientEventId that's already stored — the server dedupes on it, so
  // the write would be dropped while local state still applied it.
  const beginBallAttempt = () => {
    idemRef.current = { base: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, n: 0, done: {} };
  };

  // ALL OUT IS ONE SHORT OF THE XI — not ten.
  //
  // Ten was hardcoded in six places, and this app lets a squad be anything from
  // 1 to 15 (MAX_XI on the toss screen), which local cricket uses: eight-a-side
  // is an ordinary Sunday. Both directions were wrong.
  //
  //   · Eight a side — all out is 7. The app kept asking for a ninth batter,
  //     from an empty list, and never ended the innings. The scorer's only way
  //     out was Cancel and End Innings by hand.
  //   · Fifteen a side — all out is 14. The app declared "All out" at 10 with
  //     four batters still padded up, ending the innings four wickets early.
  //
  // Computed live, not frozen: "Add from squad" can grow the XI mid-innings.
  // The floor of 1 is for a degenerate squad, so nothing can end an innings
  // before a ball is bowled.
  const allOutAt = Math.max(1, battingXI.length - 1);

  const persistBall = async (runs, extras, extraType, isWicket, wicketType, countsAsBall = true, dismissedId = null, catcher = null, directHit = null, dropped = null) => {
    // Never skip the save silently: the local score would keep advancing (and
    // syncMatchSummary would keep updating the headline score) while the
    // ball-by-ball record stops — spectators then see totals move with no
    // deliveries behind them. Throw so handleScore alerts and doesn't apply
    // the ball locally.
    if (!striker || !nonStriker) throw new Error('Pick the new batsman before scoring the next ball');
    if (!currentInningId || !currentBowler) throw new Error('Match state is still loading — try again in a moment');
    // One slot per write this delivery makes, stable across retries.
    const seq = idemRef.current.n++;
    if (idemRef.current.done[seq]) return;   // already stored on an earlier attempt
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
      // Run outs only, and only when a fielder was named. null = not recorded.
      directHit,
      // A chance put down on this delivery. Scores nothing; it's the record.
      droppedBy: dropped?.by ?? null,
      dropDifficulty: dropped?.difficulty ?? null,
      // Idempotency key — if a retry re-sends a ball that actually landed, the
      // server dedupes instead of double-counting. The base is per-delivery and
      // survives a manual Retry; the counter separates the two writes a single
      // tap can make (the delivery plus a penalty riding along with it).
      clientEventId: `${idemRef.current.base}-${seq}`,
    });
    if (!res.success) throw new Error(res.error || 'Could not save this ball');
    idemRef.current.done[seq] = true;

    // ── Ball Intelligence ────────────────────────────────────────────────────
    // Hooked HERE, after the delivery is confirmed stored, because this one
    // function is the single door every one of the eleven scoring paths goes
    // through — and because a shot must never be offered for a ball that did not
    // actually save.
    //
    // Only strokes are asked about. A wide, a bye or a leg bye is not a shot, and
    // a penalty or a retirement is not a delivery at all — prompting for those
    // would put junk in the dataset and taps in the scorer's way. seq 0 only, so
    // a penalty riding along with a delivery doesn't ask a second time.
    const isStroke = !extraType || extraType === 'noBall';
    if (biEnabled && seq === 0) {
      if (!biPaused && isStroke) {
        const shotCtx = {
          clientEventId: `${idemRef.current.base}-${seq}`,
          runs, isWicket,
          extraType: extraType || null,
          // Snapshotted, NOT read live at render: after a wicket the sheet waits
          // for the new-batter pick, by which time `striker` is somebody else.
          batterName: striker.name,
          hand: handOf(striker),
        };
        setPendingShot(shotCtx);
        setLastShot(shotCtx);
      } else {
        // A wide, a bye, or a ball scored while paused. Clearing here is what
        // makes `lastShot` mean exactly "the delivery that just happened, if it
        // could carry a shot" — never an older one. SHOT then can't quietly edit
        // a ball two deliveries back, and the short-run adjustment below can
        // trust that lastShot is the ball being shortened.
        setLastShot(null);
      }
    }
    // Advance the local ball count only once the delivery is actually stored.
    // Bumping it before the await meant a rejected ball (e.g. the server's 409
    // bowling-rule guards) still moved the count on, so the on-screen over
    // drifted a ball ahead of what was recorded.
    if (countsAsBall) setBallCount(newBallCount);
  };

  const checkWinCondition = (newScore) => {
    if (!isInnings2) return false;
    if (newScore.runs >= target) {
      const wRemain = Math.max(0, allOutAt - newScore.wickets);
      endMatch(`${battingTeamName} won by ${wRemain} wicket${wRemain !== 1 ? 's' : ''}`, newScore);
      return true;
    }
    if (newScore.wickets >= allOutAt || newScore.overs >= totalOvers && newScore.balls === 0) {
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
    setOverComplete(null);   // no between-overs break when there is no next over
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
          if (isBowlerWicket(ball.wicketType) && over.bowlerId) {
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
    // NOT while a delivery is still in flight. The server deletes "the most
    // recent ball of the innings", so if the save lands first, this removes the
    // ball that just arrived instead of the one the scorer is looking at — and
    // the local snapshot restores the state of a different delivery on top of
    // it. handleScore has always had this guard; undo never did, and it is the
    // more dangerous of the two because it destroys rather than adds.
    if (matchComplete || undoing || !canUndo || savingRef.current) return;
    setUndoing(true);
    haptic.tick();
    const prev = history[history.length - 1];
    const res = await legendsApi.undoLastBall(matchData.id, currentInningId);
    if (!res.success) {
      showToast(res.error || 'Could not undo', 'error');
      setUndoing(false);
      return;
    }
    // Winding the ball back also lifts any mandatory prompt it triggered: undoing
    // the over-ending ball drops us mid-over (no next bowler needed), and undoing a
    // wicket puts the dismissed batter back (no new batsman needed).
    setMustPickBowler(false);
    setOverComplete(null);   // back inside the over — the break no longer applies
    // ...and its shot prompt with it. Leaving this set would ask "where did it
    // go?" about a delivery that no longer exists, and file the answer against a
    // ball the scorer has just taken off the board. Anything already queued for
    // it is dropped by the queue itself when the server answers BALL_GONE, and
    // anything already stored went with the ball (the row cascades on delete).
    setPendingShot(null);
    // The "edit last shot" button must go too, or it would reopen the sheet for a
    // delivery that no longer exists and file the answer against a dead ball.
    setLastShot(null);
    // No snapshot for this ball — it was scored before this session (a resume
    // clears the in-memory stack). The server has already deleted the ball, so
    // rebuild every figure from its live-state projection instead. This is what
    // lets Undo keep stepping back to the first ball of the innings; the server
    // stops us at the innings boundary by only ever deleting from currentInningId.
    if (!prev) {
      const live = await legendsApi.getLiveState(matchData.id);
      const d = live.data;
      // The ball IS already gone server-side, so a bad projection must not leave a
      // stale board on screen pretending otherwise — say so rather than paint numbers
      // rebuilt from undefined.
      if (!live.success || typeof d?.totalRuns !== 'number') {
        showToast('Ball undone — reopen the match to refresh', 'error');
        setUndoing(false);
        return;
      }
      applyLiveState(d, 'undo');
      syncMatchSummary(`${d.totalRuns}/${d.wickets} (${d.completedOvers}.${d.ballInOver})`);
      setLastBallShort(false);
      showToast('Last ball undone', 'success');
      setUndoing(false);
      return;
    }
    setHistory((h) => h.slice(0, -1));
    setCurrentScore(prev.score);
    setCurrentOver(prev.over);
    setLastOverBalls(prev.lastOver || []);   // restore the "LAST OVER" view too
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
    if (prev.bowlerLastOver) setBowlerLastOver(prev.bowlerLastOver);
    if ('freeHit' in prev) setFreeHit(prev.freeHit);
    if (prev.retiredBatters) setRetiredBatters(prev.retiredBatters);
    if ('pnrStartRuns' in prev) setPnrStartRuns(prev.pnrStartRuns);
    if ('pnrBalls' in prev) setPnrBalls(prev.pnrBalls);
    // Guarded like the rest: a snapshot taken before this shipped has no copy.
    if (prev.milestones) milestoneRef.current = prev.milestones;
    setShowPlayerModal(false);
    setShowBowlerModal(false);
    const s = `${prev.score.runs}/${prev.score.wickets} (${prev.score.overs}.${prev.score.balls})`;
    syncMatchSummary(s);
    setLastBallShort(false);   // the undone ball's short-run flag goes with it
    showToast('Last ball undone', 'success');
    setUndoing(false);
  };

  // Accidental short run on the LAST ball: dock exactly one run. The batters keep
  // the ends they physically reached, so strike is NOT changed here — the ball
  // already rotated it by the runs actually run (a 2 stayed, a 3 crossed). We only
  // reduce the awarded total by 1: team score, the facing batter's runs, and the
  // over chip. The delivery still counts. One per ball.
  const applyShortRun = async () => {
    // Same guard as undo, and for the same reason: the server docks the run from
    // "the last ball of the innings", so a short run tapped while a delivery is
    // still in flight lands on whichever ball arrives first. Undo and this are
    // the only two controls that reach backwards and edit a stored delivery, so
    // they are the only two that need it — but they BOTH need it, and fixing
    // one without the other left the same race under a different button.
    if (!shortRunEligible || undoing || savingRef.current) return;
    const attempt = shortRunAttempt;               // 2 or 3
    const awarded = attempt - 1;                   // 1 or 2
    // Who faced it: an even run left the striker on strike; an odd run crossed
    // them, so the facer is now the non-striker.
    const facer = attempt % 2 === 0 ? striker : nonStriker;
    const res = await legendsApi.shortenLastBall(matchData.id, currentInningId);
    if (!res.success) { showToast(res.error || 'Could not record short run', 'error'); return; }
    haptic.tick();
    const nextRuns = currentScore.runs - 1;
    setCurrentScore((sc) => ({ ...sc, runs: sc.runs - 1 }));
    if (facer) setBatStats((prev) => {
      const c = prev[facer.id] || { runs: 0, balls: 0, fours: 0, sixes: 0 };
      return { ...prev, [facer.id]: { ...c, runs: Math.max(0, c.runs - 1) } };
    });
    setCurrentOver((o) => { const n = [...o]; n[n.length - 1] = String(awarded); return n; });
    // Keep the shot sheet's headline honest. Reopening SHOT after a short run was
    // still announcing the original figure — "FOUR" over a delivery the scorer
    // had just cut to 3. The server already recomputes the stored outcome; this
    // is the same correction on the copy the sheet reads. Safe because a short
    // run only applies to a bare '2' or '3' chip, which is always a plain stroke,
    // and lastShot is now either that exact delivery or null.
    setLastShot((s) => (s ? { ...s, runs: Math.max(0, s.runs - 1) } : s));
    setLastBallShort(true);
    syncMatchSummary(`${nextRuns}/${currentScore.wickets} (${currentScore.overs}.${currentScore.balls})`);
    showToast(`Short run · ${attempt} → ${awarded}`, 'success');
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
  // runOut = the run-out draft ({ delivery, runs, runsType, outSlot, end }) gathered
  //   by the four run-out sheets. Present ONLY for a run out — every other dismissal
  //   is a plain legal ball with no runs, which is what the null path scores.
  const handleScore = async (value, addRuns = 0, wicketType = 'bowled', dismissed = 'striker', catcher = null, penaltyReason = null, isRetry = false, runOut = null, dropped = null, outExtra = null) => {
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
    // A fresh delivery gets a fresh idempotency base; a Retry reuses the failed
    // ball's base (rewinding the counter) so the server can recognise it.
    if (isRetry) idemRef.current.n = 0;   // rewind the sequence; `done` and `base` stand
    else beginBallAttempt();
    // `dropped` and `outExtra` ride along too: a retry rebuilt the ball from
    // this and dropped both, so retrying a failed delivery lost the dropped
    // catch, and would have quietly turned a stumping off a wide into one off a
    // legal ball — a different over, by one delivery.
    retryRef.current = { value, addRuns, wicketType, dismissed, catcher, penaltyReason, runOut, dropped, outExtra };
    setSyncState({ status: 'saving', error: null });
    try {
    // Snapshot the pre-ball state so this delivery can be taken back. Built
    // here, but committed only once the ball is actually stored (below) — a
    // rejected ball used to leave an undo entry for a delivery that never
    // happened, so Undo would "take back" nothing.
    const snapshot = {
      score: { ...currentScore }, over: [...currentOver], lastOver: [...lastOverBalls], ballCount,
      striker, nonStriker, bowler: currentBowler,
      batStats: { ...batStats }, bowlStats: { ...bowlStats }, outBatters: [...outBatters],
      // The end of an over bumps the bowler's spell count and records who bowled
      // it (the no-consecutive-overs rule). Undo used to leave both advanced, so
      // winding back past an over boundary left a bowler wrongly barred, or a
      // spell over-counted — invisible until the picker refused them.
      bowlerOvers: { ...bowlerOvers }, lastOverBowlerId, bowlerLastOver: { ...bowlerLastOver },
      freeHit, retiredBatters: [...retiredBatters],
      pnrStartRuns, pnrBalls,
      // The hat-trick streak, above all. It is a counter that only ever goes up
      // as wickets fall, and undo did not wind it back — so taking back a wicket
      // and re-recording it left the count one too high, and the NEXT wicket
      // announced "🎩 HAT-TRICK!" for two. A wrong claim, celebrated with a
      // haptic, in front of everyone watching the scorer.
      milestones: copyMilestones(),
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

    // A run out resolves to a whole ball — runs, extras, whether it counts, the free
    // hit, and which end each batter ends up at. Resolved once here so the scoring,
    // the player figures and the crease below all read the SAME answer.
    const ro = runOut ? resolveRunOut({
      delivery: runOut.delivery,
      runsCompleted: runOut.runs,
      runsType: runOut.runsType,
      outSlot: dismissed === 'nonstriker' ? END.NONSTRIKER : END.STRIKER,
      dismissalEnd: runOut.end,
      ballsInOverBefore: currentScore.balls,
      freeHit,
    }) : null;

    if (typeof value === 'number') {
      newScore.runs += value;
      newScore.balls += 1;
      newOver.push(value === 0 ? '·' : String(value));
      await persistBall(value, 0, null, false, null, true, null, null, null, dropped);
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
      if (ro) {
        // RUN OUT — the delivery keeps its own identity (a wide is still a wide, a
        // no ball still buys a free hit) and the runs completed before the wicket
        // fell are still scored. All of that comes back from the engine.
        newScore.runs += ro.teamRuns;
        if (ro.countsAsBall) newScore.balls += 1;
        newOver.push(ro.chip);
        await persistBall(ro.batRuns, ro.extras, ro.extraType, true, 'runout', ro.countsAsBall, outPlayer?.id, catcher, runOut?.directHit ?? null);
      } else if (outExtra === 'wide') {
        // A STUMPING OFF A WIDE. The only dismissal besides a run out that can
        // happen off one, and a common one in club cricket — a ball down the
        // leg side, a foot that drags, the bails off. It was unrecordable: the
        // wicket sheet always wrote a legal delivery, so a scorer had to choose
        // between losing the wicket (record a wide) or losing the wide's run
        // AND handing the over a delivery it never had (record a stumping),
        // which ends the over a ball early and adds one to the bowler's
        // figures. The wide stands: its run counts, the ball does not.
        newScore.runs += 1;
        newOver.push(ballChip({ extraType: 'wide', extras: 1, isWicket: true }));
        await persistBall(0, 1, 'wide', true, wicketType, false, outPlayer?.id, catcher);
      } else {
        newScore.balls += 1;
        newOver.push('W');
        await persistBall(0, 0, null, true, wicketType, true, outPlayer?.id, catcher);
      }
      if (outPlayer) setOutBatters((prev) => [...prev, outPlayer.id]);   // can't re-bat this innings
      // Which end is now empty. Every dismissal EXCEPT a run out leaves the batters
      // where they stood, so the vacated end is simply the dismissed batter's. A run
      // out can leave the not-out batter at the other end (they were mid-pitch when
      // the bails came off), so the engine says who stands where — Law 18.12.
      let emptySlot = outNon ? 'nonstriker' : 'striker';
      if (ro) {
        const survivor = outNon ? striker : nonStriker;
        if (ro.survivorAtStrikerEnd) { setStriker(survivor); setNonStriker(null); emptySlot = 'nonstriker'; }
        else { setNonStriker(survivor); setStriker(null); emptySlot = 'striker'; }
      } else if (outNon) {
        setNonStriker(null);
      } else {
        setStriker(null);
      }
      if (newScore.wickets < allOutAt) { setNewBatterFor(emptySlot); setShowPlayerModal(true); }
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
    // Hoisted: the over-complete sheet below needs what this ball cost the bowler,
    // and bowlStats' own overRuns tally is reset the moment the over closes.
    let charged = 0;
    {
      let batRuns = 0, batFaced = 0, isFour = 0, isSix = 0, tookWkt = 0;
      // A run out carries its delivery's own book-keeping: a wide is not a ball
      // faced and not one of the six, a no ball is a ball faced but not one of the
      // six, and a wicket taken before the ball was bowled is neither.
      // A stumping off a wide is the same shape: the wide is not one of the
      // bowler's six either, whoever took the bails off.
      const wideOut = !ro && value === 'out' && outExtra === 'wide';
      const bowlerLegal = ro ? ro.countsAsBall
        : (typeof value === 'number' || value === 'bye' || value === 'legbye'
           || (value === 'out' && !wideOut));
      if (typeof value === 'number') { batRuns = value; batFaced = 1; isFour = value === 4 ? 1 : 0; isSix = value === 6 ? 1 : 0; charged = value; }
      else if (value === 'wide') { charged = 1 + addRuns; }
      else if (value === 'noball') { batRuns = addRuns; batFaced = 1; charged = 1 + addRuns; }
      else if (value === 'bye' || value === 'legbye') { batFaced = 1; }
      else if (value === 'out') {
        // A wide is not a ball faced, and its penalty run IS charged to the
        // bowler. The run-out engine works all this out for run-outs (`ro`);
        // this is the same arithmetic for the one other dismissal that can be
        // made off a wide. Without it the scorer's live figures drift from the
        // scorecard's, which recomputes from the stored ball and gets it right:
        // the batter would gain a ball they never faced and the bowler a legal
        // delivery they never bowled, while losing the wide's run.
        batFaced = ro ? ro.ballFaced : (wideOut ? 0 : 1);
        batRuns = ro ? ro.batRuns : 0;
        charged = ro ? ro.chargedToBowler : (wideOut ? 1 : 0);
        // Shared rule. This was its own two-item list, so the figures a scorer
        // watched tick up during the match disagreed with the scorecard after
        // it: retired-out, retired-hurt, obstructing, timed out and hit-ball-
        // twice all credited the bowler here and none of them do on the server.
        tookWkt = isBowlerWicket(wicketType) ? 1 : 0;
      }
      // 'penalty' → no batsman/bowler effect
      // Partnership balls = legal deliveries faced by the pair (same rule as the over).
      if (bowlerLegal) setPnrBalls((b) => b + 1);
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
      setLastOverBalls(newOver);   // keep the finished over on screen until the next ball
      setCurrentOver([]);
      setBallCount(0);
      // Credit the completed over to the bowler (spell limit) + remember them
      // so they can't bowl the next over (no consecutive overs).
      if (currentBowler) {
        setBowlerOvers((prev) => ({ ...prev, [currentBowler.id]: (prev[currentBowler.id] || 0) + 1 }));
        setLastOverBowlerId(currentBowler.id);
        setBowlerLastOver((prev) => ({ ...prev, [currentBowler.id]: newScore.overs }));
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
      if (newScore.overs < totalOvers && newScore.wickets < allOutAt && !chaseWon) {
        // Break between overs: show what just happened before asking for the next
        // bowler. "Start next over" in the sheet opens the picker. Anything the
        // sheet can read from live state (score, spell figures, the crease) is
        // read at render — only the over's own chips have to be snapshotted,
        // because currentOver is cleared the instant the over closes.
        const bowlerOverRuns = currentBowler
          ? (bowlStats[currentBowler.id]?.overRuns || 0) + charged
          : 0;
        setOverComplete({
          number: newScore.overs,
          balls: newOver,
          runs: runsInOver(newOver),
          wickets: newOver.filter(isWicketChip).length,
          bowlerId: currentBowler?.id || null,
          bowlerName: currentBowler?.name || '',
          bowlerOverRuns,
          maiden: bowlerOverRuns === 0,
        });
        setMustPickBowler(true);
      }
    } else {
      setCurrentOver(newOver);
      setLastOverBalls([]);   // a ball in the new over → stop showing the previous one
    }

    // Free Hit: a no-ball sets it for the next legal ball; a legal delivery consumes
    // it (a wide keeps it alive; penalty runs don't affect it). A run out follows the
    // same rules, off the delivery it actually happened on — a run out on a no-ball
    // free hit leaves the free hit standing.
    if (value === 'noball') setFreeHit(true);
    else if (ro) setFreeHit(ro.freeHitNext);
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
    setLastBallShort(false);   // a fresh delivery: short run is available again
    setCurrentScore(newScore);
    // Every write for this delivery came back OK — say so, and drop the retry.
    // Left standing (not auto-cleared) so a glance at the strip always answers
    // whether the last ball is on the server.
    setSyncState({ status: 'synced', error: null });
    retryRef.current = null;
    const scoreStr = `${newScore.runs}/${newScore.wickets} (${newScore.overs}.${newScore.balls})`;
    syncMatchSummary(scoreStr);
    if (isInnings2) checkWinCondition(newScore);
    if (!isInnings2 && (newScore.wickets >= allOutAt || newScore.overs >= totalOvers && newScore.balls === 0)) {
      finishInnings(newScore.wickets >= allOutAt ? 'All out' : 'Overs completed', newScore);
    }
    } catch (err) {
      // The server rejected the ball. If scoring was transferred away mid-session,
      // switch straight to the live Scorecard (no alarming message); anything else
      // (e.g. a network hiccup) gets a plain, actionable alert.
      if (err.message?.includes('assigned scorer')) {
        setSyncState({ status: 'idle', error: null });
        retryRef.current = null;
        showToast('Switched to live view', 'info', 2000);
        navigation.replace('Scorecard', { matchId: matchData.id });
      } else {
        // No blocking alert: the ball simply isn't on the board (local state was
        // never applied), so the scorer can keep working and hit Retry on the
        // sync pill — which replays this exact ball under the same event id.
        haptic.warn();
        const why = err.message || 'Could not save this ball';
        setSyncState({ status: 'failed', error: why });
        showToast(why, 'error', 2600);   // the reason, once; the pill is the standing state
      }
    } finally {
      savingRef.current = false;
    }
  };

  // Replay the delivery the server refused, reusing its idempotency key.
  const retryLastBall = () => {
    const a = retryRef.current;
    if (!a || savingRef.current) return;
    haptic.tick();
    handleScore(a.value, a.addRuns, a.wicketType, a.dismissed, a.catcher, a.penaltyReason, true, a.runOut, a.dropped, a.outExtra);
  };

  // Reasons offered before ending — an innings mid-way vs. the whole match.
  const END_REASONS = {
    innings: ['All out', 'Overs completed', 'Declared', 'Rain / interruption'],
    match:   ['Target achieved', 'All out', 'Overs completed', 'Rain / abandoned', 'Match conceded'],
  };

  // Walk back an innings that was ended by mistake.
  //
  // Discards the second innings the server created (it refuses once a ball has
  // been bowled in it — at that point the way back is the ball-by-ball undo),
  // then puts every piece of scorer state back exactly as it stood. The snapshot
  // is taken inside finishInnings before it resets anything.
  const resumeFirstInnings = async () => {
    const snap = undoInningsRef.current;
    if (!snap) return { ok: false, error: 'Nothing to undo' };
    // currentInningId is the SECOND innings by now — that's the one to discard.
    const res = await legendsApi.discardInnings(matchData.id, currentInningId);
    if (!res.success) return { ok: false, error: res.error };

    setIsInnings2(false);
    setCurrentInningId(snap.inningId);
    setCurrentScore(snap.score);
    setCurrentOver(snap.currentOver); setLastOverBalls(snap.lastOverBalls);
    setBallCount(snap.ballCount); setHistory(snap.history); setOverComplete(snap.overComplete);
    setBatStats(snap.batStats); setBowlStats(snap.bowlStats);
    setBowlerOvers(snap.bowlerOvers); setLastOverBowlerId(snap.lastOverBowlerId);
    setBowlerLastOver(snap.bowlerLastOver);
    setOutBatters(snap.outBatters); setRetiredBatters(snap.retiredBatters);
    setPendingCreaseSwap(snap.pendingCreaseSwap);
    setPnrStartRuns(snap.pnrStartRuns); setPnrBalls(snap.pnrBalls);
    setBattingTeamName(snap.battingTeamName); setBowlingTeamName(snap.bowlingTeamName);
    setBattingTeamId(snap.battingTeamId); setBowlingTeamId(snap.bowlingTeamId);
    setBattingXI(snap.battingXI); setBowlingXI(snap.bowlingXI);
    setKeeperId(snap.keeperId);
    setStriker(snap.striker); setNonStriker(snap.nonStriker); setCurrentBowler(snap.currentBowler);
    milestoneRef.current = snap.milestones;
    setFirstInningsScore({ runs: 0, wickets: 0, overs: 0 });
    // The crease is repopulated, so scoring resumes rather than asking for
    // openers again.
    setScoringReady(true);
    setInningsBreak(null);
    undoInningsRef.current = null;
    showToast('Back in the 1st innings', 'success');
    return { ok: true };
  };

  // End the current innings/match with a recorded reason. `scoreOverride` lets an
  // automatic end (all-out / overs-done) pass the just-computed score.
  const finishInnings = async (reason, scoreOverride) => {
    const score = scoreOverride || currentScore;
    if (!isInnings2) {
      // Snapshot the innings while the figures still exist. Everything below
      // resets batStats/bowlStats/XIs for the second innings, so the break
      // screen has to take its copy here or it has nothing to show.
      // Top three each. Batters need to have faced a ball, not to have scored —
      // a 0 (8) is part of the story. Bowlers are ranked on wickets then runs
      // conceded, so an economical wicketless spell still shows rather than the
      // card coming back empty when nobody took one.
      const topBatters = battingXI
        .map((p) => ({ name: p.name, ...(batStats[p.id] || {}) }))
        .filter((b) => (b.balls || 0) > 0)
        .sort((a, b) => (b.runs || 0) - (a.runs || 0) || (a.balls || 0) - (b.balls || 0))
        .slice(0, 3);
      const topBowlers = bowlingXI
        .map((p) => ({ name: p.name, ...(bowlStats[p.id] || {}) }))
        .filter((b) => (b.balls || 0) > 0)
        .sort((a, b) => (b.wickets || 0) - (a.wickets || 0) || (a.runs || 0) - (b.runs || 0))
        .slice(0, 3);
      setInningsBreak({
        battingTeam: battingTeamName,
        bowlingTeam: bowlingTeamName,
        score: `${score.runs}/${score.wickets}`,
        overs: `${score.overs}.${score.balls}`,
        totalOvers,
        runRate: (score.overs * 6 + score.balls) > 0
          ? (score.runs / ((score.overs * 6 + score.balls) / 6)).toFixed(2) : '0.00',
        target: score.runs + 1,
        reason,
        batters: topBatters,
        bowlers: topBowlers,
      });
      // Everything the reset below is about to throw away. "Rain / abandoned"
      // sits next to the reasons you actually mean in the picker, so ending the
      // wrong innings is a real mis-tap — and it used to be final. Held in a ref
      // (not state) so restoring it can't race a re-render.
      undoInningsRef.current = {
        inningId: currentInningId,
        score, currentOver, lastOverBalls, ballCount, history, overComplete,
        batStats, bowlStats, bowlerOvers, lastOverBowlerId, bowlerLastOver,
        outBatters, retiredBatters, pendingCreaseSwap,
        pnrStartRuns, pnrBalls,
        battingTeamName, bowlingTeamName, battingTeamId, bowlingTeamId,
        battingXI, bowlingXI, keeperId,
        striker, nonStriker, currentBowler,
        milestones: copyMilestones(),
      };
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
      setCurrentOver([]); setLastOverBalls([]); setBallCount(0); setHistory([]); setOverComplete(null);
      // A shot prompt left over from the first innings must not surface against
      // the second: the last ball of an innings can leave one un-answered (the
      // innings-break screen covers the sheet), and it would otherwise reappear
      // over the new innings asking about the other team's batter.
      setPendingShot(null); setLastShot(null);
      // Fresh innings → reset per-player figures + bowling spell tracking + dismissals.
      setBatStats({}); setBowlStats({}); setBowlerOvers({}); setLastOverBowlerId(null); setBowlerLastOver({}); setOutBatters([]); setRetiredBatters([]); setPendingCreaseSwap(false);
      setPnrStartRuns(0); setPnrBalls(0);   // fresh openers → new partnership
      milestoneRef.current = { bat: {}, bowl: {}, streak: { id: null, n: 0 } };   // fresh milestones for the new innings
      setBattingTeamName(bowlingTeamName); setBowlingTeamName(battingTeamName);
      setBattingXI(bowlingXI); setBowlingXI(battingXI);
      setKeeperId(null);   // other side in the field now → their keeper, not this one's
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
    // Adding to the XI only ARMS the player in the picker behind this sheet — the
    // scorer still confirms with "Continue scoring", same as any other name in the
    // list. Committing straight from here would sidestep that check.
    if (kind === 'bat') {
      setBattingXI((xi) => xi.some((x) => x.id === p.id) ? xi : [...xi, entry]);
      setPendingBatter(entry);
    } else {
      setBowlingXI((xi) => xi.some((x) => x.id === p.id) ? xi : [...xi, entry]);
      setPendingBowler(entry);
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
      score: { ...currentScore }, over: [...currentOver], lastOver: [...lastOverBalls], ballCount,
      striker, nonStriker, bowler: currentBowler,
      batStats: { ...batStats }, bowlStats: { ...bowlStats }, outBatters: [...outBatters],
      bowlerOvers: { ...bowlerOvers }, lastOverBowlerId, bowlerLastOver: { ...bowlerLastOver },
      freeHit, retiredBatters: [...retiredBatters],
    }]);
    haptic.warn();
    beginBallAttempt();   // this write is its own delivery, not part of a scored ball
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
    if (newScore.wickets < allOutAt) setShowPlayerModal(true);
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

  // ── PICKER CONFIRMATION ───────────────────────────────────────────────────
  // Tapping a name arms it; these commit it. Closing a picker always disarms, so
  // a pick can never carry over into the next prompt.
  const closeBatterPicker = () => { setShowPlayerModal(false); setNewBatterFor('striker'); setPendingBatter(null); };
  const closeBowlerPicker = () => { setShowBowlerModal(false); setPendingBowler(null); };

  const confirmBatter = () => {
    const p = pendingBatter;
    if (!p) return;
    haptic.tick();
    // Place the new batter in the dismissed slot, then apply any deferred
    // end-of-over swap — computed on locals and set once, so chained setState
    // calls can't clobber each other (which used to drop the not-out batter and
    // keep the dismissed one).
    let ns = striker, nn = nonStriker;
    if (newBatterFor === 'nonstriker') nn = p; else ns = p;
    if (pendingCreaseSwap) { const t = ns; ns = nn; nn = t; setPendingCreaseSwap(false); }
    setStriker(ns); setNonStriker(nn);
    // A new batter on the crease starts a fresh partnership.
    setPnrStartRuns(currentScore.runs); setPnrBalls(0);
    // Coming back from retired hurt → they're no longer waiting in the wings.
    setRetiredBatters((prev) => prev.filter((r) => r.id !== p.id));
    closeBatterPicker();
  };

  // ── RUN OUT — open the flow. Starts from what was BOWLED and how many runs were
  // completed, because those decide everything after them: whether the ball counts,
  // whether the free hit survives, and what goes on the board. The old flow asked
  // only "which batter?" and "which fielder?", so every run out was silently scored
  // as a legal dot ball — runs run before the wicket vanished, and a run out on a
  // wide or no ball stole a delivery from the over.
  const openRunOut = () => {
    haptic.tick();
    setRunOutDraft({ delivery: DELIVERY.LEGAL, runs: 0, runsType: RUNS.BAT, outSlot: END.STRIKER, end: END.STRIKER });
    setRunOutDeliveryPrompt(true);
  };
  const patchRunOut = (patch) => setRunOutDraft((d) => ({ ...(d || {}), ...patch }));

  // Committed from the last sheet (the fielder), with every answer gathered.
  const commitRunOut = (fielderName) => {
    const d = runOutDraft;
    setRunOutFielderPrompt(false);
    setRunOutDraft(null);
    // No fielder named → nothing to credit, so the direct-hit answer is moot.
    const directHit = fielderName ? runOutDirectHit : null;
    setRunOutDirectHit(false);
    if (!d) return;
    handleScore('out', d.runs, 'runout', d.outSlot, fielderName, null, false, { ...d, directHit });
  };

  const commitDrop = (runs) => {
    const d = dropDraft;
    setDropRunsPrompt(false);
    setDropDraft(null);
    if (!d) return;
    // An ordinary delivery in every other respect — the drop rides along on it.
    handleScore(runs, 0, 'bowled', 'striker', null, null, false, null, d);
  };

  // Would this delivery close the over? Only a legal one can, and only as the 6th —
  // which is what decides whether the batters change ends on top of the run out.
  const runOutClosesOver = (d) => (d?.delivery === DELIVERY.LEGAL) && currentScore.balls === 5;

  // Who faces the next ball if the wicket falls at `end` — shown on the end sheet
  // so the scorer confirms the consequence, not the jargon.
  const strikeAfterRunOut = (d, end) => {
    if (!d) return '';
    const e = resolveEnds({ outSlot: d.outSlot, dismissalEnd: end, overComplete: runOutClosesOver(d) });
    const survivor = d.outSlot === END.NONSTRIKER ? striker : nonStriker;
    return e.nextStrikerIs === 'survivor' ? `${survivor?.name || 'Not-out batter'} on strike` : 'New batter on strike';
  };

  // ── CAUGHT — arm a catcher, then commit. The scorecard line the pick will write,
  // so the confirm button can show what actually goes in the book.
  const armCatcher = (pick) => { haptic.tick(); setPendingCatcher(pick); };
  const catchNotation = (pick) => (
    pick.kind === 'cb'
      ? `c & b ${currentBowler?.name || 'bowler'}`
      : `c ${pick.name} b ${currentBowler?.name || 'bowler'}`
  );
  const commitCatch = () => {
    const pick = pendingCatcher;
    if (!pick) return;
    setCatchPrompt(false);
    setPendingCatcher(null);
    handleScore('out', 0, 'caught', 'striker', pick.name);
  };

  // Put the other batter on strike. Only a correction — every normal change of ends
  // is applied by the ball itself — so it's deliberately not tied to a delivery: it
  // just re-seats the crease, which the crease effect persists like any other change.
  const canSwapStrike = scoringReady && !matchComplete && !!striker && !!nonStriker;
  const swapStrike = () => {
    if (!canSwapStrike) return;
    haptic.tick();
    setMorePrompt(false);
    setStriker(nonStriker);
    setNonStriker(striker);
    showToast(`${nonStriker.name} on strike`, 'info', 1800);
  };

  // Long-press on any run button. Discoverability is the weak point of a
  // long-press, so More Options carries the same entry.
  const openOtherRuns = () => { haptic.tick(); setRunsPrompt(true); };

  // Leave the between-overs break and go pick the next bowler. Also what the
  // hardware back button does, so the sheet can't trap the scorer.
  const startNextOver = () => {
    haptic.tick();
    setOverComplete(null);
    setShowBowlerModal(true);
  };

  const confirmBowler = () => {
    const p = pendingBowler;
    if (!p) return;
    haptic.tick();
    setCurrentBowler(p);
    setMustPickBowler(false);
    closeBowlerPicker();
  };

  // Ball display in over tracker
  const renderBallDot = (b, i, isLast = false) => {
    const CKdot = cricketColors(DS);
    let bg = DS.surfaceHighest;
    let color = DS.textPrimary;
    let label = b;
    const str = String(b).toLowerCase();

    if (str === '·') label = '0';

    // A wicket wins the colour even when it rode in on an extra ('WD+W', '3nb+W') —
    // it's the one thing on the strip you must never miss.
    if (isWicketChip(b)) { bg = DS.wicketBg; color = DS.wicketText; } // Wickets
    else if (str.includes('wd') || str.includes('nb')) { bg = DS.tintDanger; color = DS.coral; } // Wides, NBs
    else if (str.includes('b')) { bg = DS.surfaceHigh; color = DS.textVariant; } // Byes / Leg Byes
    // Fours and sixes take their colour from the cricket palette, not from brand
    // tokens picked by hand — a four was DS.blue here, a colour the brand retired
    // and which sunlight mode renders as black. The tint carries the emphasis,
    // the text carries the meaning, and both follow the mode.
    else if (str.includes('4')) { bg = DS.tintAccent; color = CKdot.four; } // Fours
    else if (str.includes('6')) { bg = DS.tintAccentStrong; color = CKdot.six; } // Sixes
    else if (label === '0') { bg = DS.surfaceHighest; color = DS.textMuted; } // Dots
    else { bg = DS.surfaceHigh; color = DS.textPrimary; } // Normal runs

    // A wicket on an extra makes for the longest chip on the strip ('3wd+W'), so
    // the type shrinks to fit rather than clipping inside the 32pt dot.
    const len = String(label).length;
    const fs = len >= 5 ? 9 : len === 4 ? 10 : len === 3 ? 12 : 14;

    // The just-recorded ball is ringed + scaled up a touch, so a tap lands with
    // clear confirmation of what went in.
    return (
      <View key={i} style={[styles.overBall, { backgroundColor: bg }, isLast && [styles.overBallLast, { borderColor: color }]]}>
        <Text numberOfLines={1} style={[styles.overBallText, { color, fontSize: fs }]}>{label}</Text>
      </View>);
  };

  // Between overs (the over just ended, the next ball isn't bowled yet) keep the
  // finished over on screen so its final ball — and what an undo would remove —
  // stays visible instead of a blank strip.
  const betweenOvers = currentOver.length === 0 && lastOverBalls.length > 0 && mustPickBowler;
  const displayOver = betweenOvers ? lastOverBalls : currentOver;

  // Fill remaining balls as empty dots
  const filledOver = [...displayOver];
  while (filledOver.length < 6) filledOver.push(null);

  // The last delivery shown — on the UNDO button so it doubles as "what you just
  // recorded / what undo will remove". Uses the displayed over, so between overs
  // it names the finished over's last ball rather than going blank.
  const lastBall = displayOver.length
    ? (String(displayOver[displayOver.length - 1]) === '·' ? '0' : String(displayOver[displayOver.length - 1]))
    : null;

  // Short Run — only when the LAST ball was runs the batters RAN (2 or 3; the 4/6
  // buttons are boundaries, not run, so they're excluded) and hasn't already been
  // docked. One short run per ball. Awarded = attempted − 1.
  const lastChip = currentOver.length ? String(currentOver[currentOver.length - 1]) : null;
  const shortRunAttempt = (lastChip === '2' || lastChip === '3') ? parseInt(lastChip, 10) : 0;
  const shortRunEligible = scoringReady && !matchComplete && !lastBallShort && shortRunAttempt >= 2;

  const overRunsSoFar = runsInOver(displayOver);

  // Real bowler figures: Overs - Maidens - Runs - Wickets (O-M-R-W).
  const figFor = (id) => {
    const b = bowlStats[id] || { balls: 0, runs: 0, wickets: 0, maidens: 0 };
    // Economy trails the O-M-R-W, so every place that shows a bowler's figures
    // (crease panel, previous bowler, over-complete sheet) gets it for free.
    const econ = b.balls ? (b.runs / (b.balls / 6)).toFixed(2) : null;
    return `${Math.floor(b.balls / 6)}.${b.balls % 6} - ${b.maidens} - ${b.runs} - ${b.wickets}${econ ? ` · ${econ}` : ''}`;
  };
  const bowlerStats = currentBowler ? figFor(currentBowler.id) : '—';

  // Who bowled the previous over — shown, quieter, under the current bowler.
  const prevBowler = lastOverBowlerId && lastOverBowlerId !== currentBowler?.id
    ? bowlingXI.find((p) => p.id === lastOverBowlerId)
    : null;

  // The keeper for the fielding side, used by "caught behind". A scorer pick wins;
  // otherwise take the XI's keeper — but only when it's unambiguous (a squad with
  // two keepers in it can't say which one has the gloves on today).
  const keeper = (() => {
    if (keeperId) return bowlingXI.find((p) => p.id === keeperId) || null;
    // Named at the toss — an explicit answer, so it works even for a squad
    // carrying two keepers by role, which the fallback below has to give up on.
    // Per team, because the second innings swaps who is in the field.
    const named = tossKeepers.current[bowlingTeamId];
    if (named) { const p = bowlingXI.find((x) => x.id === named); if (p) return p; }
    const wks = bowlingXI.filter((p) => isKeeperRole(p.role));
    return wks.length === 1 ? wks[0] : null;
  })();

  // The gloves changing hands mid-innings is ordinary cricket — the keeper gets
  // hit, or takes the ball for a few overs. Scoring already remembered the
  // change for its own use; this also writes it to the match squad, so the
  // scorecard's WK badge follows the game instead of showing whoever was marked
  // at the toss for the rest of the day.
  //
  // Fire-and-forget: a scorer must never be blocked from recording a wicket
  // because a badge didn't save.
  const pickKeeper = useCallback((playerId) => {
    setKeeperId(playerId);
    if (matchData?.id && bowlingTeamId) {
      legendsApi.setMatchKeeper(matchData.id, { teamId: bowlingTeamId, playerId }).catch(() => {});
    }
  }, [matchData?.id, bowlingTeamId]);

  // ── INNINGS BREAK ─────────────────────────────────────────────
  // The first innings used to end straight into "SELECT PLAYERS" for the second,
  // which skips past the thing everyone wants at the interval (what just
  // happened) and offers no way to change scorer. Both sides taking a half each
  // is the normal arrangement in local cricket; a dedicated scorer simply taps
  // Continue and carries on.
  if (inningsBreak) {
    return (
      <InningsBreakScreen
        data={inningsBreak}
        matchId={matchData?.id}
        venue={matchData?.venue}
        onContinue={() => setInningsBreak(null)}
        onResumeFirst={resumeFirstInnings}
        onHandedOver={(name) => {
          setInningsBreak(null);
          // The book is theirs now — every scoring write from this device would
          // be rejected by assertScorer, so don't pretend otherwise.
          Alert.alert(
            'Scoring handed over',
            `${name} is now scoring this match. They'll pick the openers for the second innings.`,
            [{ text: 'OK', onPress: () => navigation.goBack() }],
          );
        }}
      />
    );
  }

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
              // The single most-watched number in a chase — give it a bold pill
              // (need · balls left · required rate) instead of a quiet line.
              <View style={styles.chaseStrip}>
                <Text style={styles.chaseNeed}>NEED <Text style={styles.chaseBig}>{need}</Text></Text>
                <View style={styles.chaseSep} />
                <Text style={styles.chaseMeta}><Text style={styles.chaseNum}>{ballsLeft}</Text> ball{ballsLeft !== 1 ? 's' : ''}</Text>
                {rrr ? <><View style={styles.chaseSep} /><Text style={styles.chaseMeta}>RRR <Text style={styles.chaseNum}>{rrr}</Text></Text></> : null}
              </View>
            }
            {matchComplete &&
              <View style={styles.resultPill}><Text style={styles.resultText}>{matchResult}</Text></View>}
          </View>
          <View style={styles.sbRatesCol}>
            <View style={styles.sbRates}>
              {/* RRR now lives in the chase pill (left); keep CRR here always.
                  Projected is 1st-innings only — in a chase the target is the
                  number that matters, and it's already in the pill. */}
              {projected != null &&
                <Text style={styles.sbRate}>PROJ <Text style={styles.sbRateNum}>{projected}</Text></Text>}
              <Text style={styles.sbRate}>CRR <Text style={styles.sbRateNumCrr}>{crr}</Text></Text>
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
              <Text style={styles.overLabel} numberOfLines={1}>{betweenOvers ? 'LAST OVER' : 'THIS OVER'}</Text>
              {freeHit && <View style={styles.freeHitPill}><Text style={styles.freeHitText}>FREE HIT</Text></View>}
              {/* ── PER-BALL SYNC STATE ──────────────────────────────────────
                  SAVING while the write is in flight (which is also why taps are
                  being ignored), SYNCED once the server has the ball, and a
                  tappable RETRY if it was refused — the ball is NOT on the board
                  in that case, so this is the only way it gets recorded. ── */}
              {syncState.status === 'failed' ? (
                <TouchableOpacity
                  style={[styles.syncPill, styles.syncPillFail]}
                  onPress={retryLastBall}
                  activeOpacity={0.75}>
                  <Icon name="cloud-alert" size={11} color={DS.coral} />
                  <Text style={[styles.syncPillText, { color: DS.coral }]}>NOT SAVED · RETRY</Text>
                </TouchableOpacity>
              ) : syncState.status !== 'idle' && (
                <View style={[styles.syncPill, syncState.status === 'saving' ? styles.syncPillSaving : styles.syncPillOk]}>
                  <Icon
                    name={syncState.status === 'saving' ? 'cloud-upload-outline' : 'cloud-check-outline'}
                    size={11}
                    color={syncState.status === 'saving' ? DS.textVariant : DS.lime} />
                  <Text style={[styles.syncPillText, { color: syncState.status === 'saving' ? DS.textVariant : DS.lime }]}>
                    {syncState.status === 'saving' ? 'SAVING' : 'SYNCED'}
                  </Text>
                </View>
              )}
              {/* ── BALL INTELLIGENCE STATE ──────────────────────────────────
                  Only ever shown when the scorer opted in, and tappable to pause
                  it — the over rate does not care that you wanted analytics, and
                  a scorer falling behind needs to shed the optional work without
                  hunting through a settings screen. Pausing stops the prompt; it
                  does NOT stop scoring and does not discard what was captured. */}
              {biEnabled && (
                <TouchableOpacity
                  style={[styles.pillIcon, biPaused ? styles.syncPillSaving : styles.syncPillOk]}
                  onPress={() => { haptic.tick(); setBiPaused((p) => !p); }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={biPaused ? 'Resume Ball Intelligence' : 'Pause Ball Intelligence'}>
                  <Icon name={biPaused ? 'play-circle-outline' : 'chart-scatter-plot'} size={13}
                    color={biPaused ? DS.textVariant : DS.lime} />
                </TouchableOpacity>
              )}
              {/* Reopen the last delivery's shot. The wrong wedge gets tapped, the
                  sheet gets dismissed, and until this existed the only remedy was
                  undoing a perfectly good ball to rescore it. Shown only when
                  there is actually a delivery to correct. */}
              {biEnabled && !!lastShot && !pendingShot && (
                <TouchableOpacity
                  style={[styles.pillIcon, styles.syncPillSaving]}
                  onPress={() => { haptic.tick(); setPendingShot(lastShot); }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Edit the shot for the last delivery">
                  <Icon name="pencil-outline" size={13} color={DS.textVariant} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.overSummary} numberOfLines={1}>
              <Text style={styles.overSummaryRuns}>{overRunsSoFar}</Text>
              <Text style={styles.overSummaryUnit}> {overRunsSoFar === 1 ? 'run' : 'runs'} · {displayOver.length} ball{displayOver.length !== 1 ? 's' : ''}</Text>
            </Text>
          </View>
          <ScrollView ref={overScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.overBalls}>
            {filledOver.map((b, i) =>
            b !== null ? renderBallDot(b, i, i === displayOver.length - 1) :
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
                const sr = srOf(striker.id);
                return `${st.runs} (${st.balls})${sr ? ` · SR ${sr}` : ''}  ${st.fours}×4 ${st.sixes}×6`; })() : '—'}
            </Text>
          </View>

          <View style={[styles.creaseRow, styles.creaseRowDivider]}>
            {nonStriker && <PlayerAvatar name={nonStriker.name} avatarUrl={nonStriker.avatarUrl} size={24} style={styles.creaseAvatar} />}
            <Text style={styles.creaseName} numberOfLines={1}>{nonStriker?.name || '—'}</Text>
            <Text style={styles.creaseFig}>
              {nonStriker ? (() => { const st = batStats[nonStriker.id] || { runs: 0, balls: 0 };
                const sr = srOf(nonStriker.id);
                return `${st.runs} (${st.balls})${sr ? ` · SR ${sr}` : ''}`; })() : ''}
            </Text>
          </View>

          {/* Current partnership — quiet strip between bat and bowl. */}
          {striker && nonStriker ? (
            <View style={styles.pnrRow}>
              <Text style={styles.pnrLabel}>PARTNERSHIP</Text>
              <Text style={styles.pnrFig}>{Math.max(0, currentScore.runs - pnrStartRuns)} <Text style={styles.pnrFigSub}>({pnrBalls})</Text></Text>
            </View>
          ) : null}

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

        {/* ── EXTRAS ROW — tap for +runs (wide 2, no-ball 4, etc.). Penalty 5 used
            to sit here too, but it's a rare call (helmet hit) that was taking a
            sixth of a row the scorer hits every over — it lives in MORE OPTIONS
            now, and the four extras get the width instead. ── */}
        {!matchComplete &&
        <View style={[styles.extraRow, saving && styles.busyBlock]} pointerEvents={saving ? 'none' : 'auto'}>
            <TouchableOpacity
              style={[styles.extraBtn, styles.undoBtn, (!canUndo || undoing) && { opacity: 0.4 }]}
              hitSlop={EXTRA_HIT}
              accessibilityRole="button" accessibilityLabel="Undo the last delivery"
              onPress={undoLastBall} disabled={!canUndo || undoing}>
              <Icon name="undo-variant" size={15} color={DS.coral} />
              {/* No adjustsFontSizeToFit: it clips the text outright on Android
                  rather than shrinking it, which is how this label ended up
                  reading "UND" on some devices. The label is short and the box
                  is wide (flex 2) — one fixed size fits every case it has. */}
              <Text style={[styles.extraBtnText, styles.undoBtnText]} numberOfLines={1}>
                UNDO{lastBall ? ` ${lastBall}` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extraBtn} hitSlop={EXTRA_HIT} onPress={() => setExtraPrompt('wide')}
              accessibilityRole="button" accessibilityLabel="Wide, add runs">
              <Text style={[styles.extraBtnText, { color: DS.coral }]}>WD +</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extraBtn} hitSlop={EXTRA_HIT} onPress={() => setExtraPrompt('noball')}
              accessibilityRole="button" accessibilityLabel="No ball, add runs">
              <Text style={[styles.extraBtnText, { color: DS.coral }]}>NB +</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extraBtn} hitSlop={EXTRA_HIT} onPress={() => setExtraPrompt('bye')}
              accessibilityRole="button" accessibilityLabel="Byes, add runs">
              <Text style={styles.extraBtnText}>BYE +</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extraBtn} hitSlop={EXTRA_HIT} onPress={() => setExtraPrompt('legbye')}
              accessibilityRole="button" accessibilityLabel="Leg byes, add runs">
              <Text style={styles.extraBtnText}>LB +</Text>
            </TouchableOpacity>
          </View>
        }

        {/* ── RUNS GRID (0-6) — flexes to fill ── */}
        {!matchComplete &&
        <View style={[styles.grid, saving && styles.busyBlock]} pointerEvents={saving ? 'none' : 'auto'}>
            <View style={styles.gridRow}>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnDot]} onPress={() => handleScore(0)} onLongPress={openOtherRuns}
                accessibilityRole="button"
                accessibilityLabel="Dot ball, no run"
                accessibilityHint="Hold for 5, 7 or more runs">
                <Text style={styles.gridBtnNum}>0</Text><Text style={styles.gridBtnLabel}>DOT</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnDot]} onPress={() => handleScore(1)} onLongPress={openOtherRuns}
                accessibilityRole="button"
                accessibilityLabel="One run"
                accessibilityHint="Hold for 5, 7 or more runs">
                <Text style={styles.gridBtnNum}>1</Text><Text style={styles.gridBtnLabel}>SINGLE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnDot]} onPress={() => handleScore(2)} onLongPress={openOtherRuns}
                accessibilityRole="button"
                accessibilityLabel="Two runs"
                accessibilityHint="Hold for 5, 7 or more runs">
                <Text style={styles.gridBtnNum}>2</Text><Text style={styles.gridBtnLabel}>DOUBLE</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.gridRow}>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnDot]} onPress={() => handleScore(3)} onLongPress={openOtherRuns}
                accessibilityRole="button"
                accessibilityLabel="Three runs"
                accessibilityHint="Hold for 5, 7 or more runs">
                <Text style={styles.gridBtnNum}>3</Text><Text style={styles.gridBtnLabel}>TRIPLE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnFour]} onPress={() => handleScore(4)} onLongPress={openOtherRuns}
                accessibilityRole="button"
                accessibilityLabel="Four"
                accessibilityHint="Hold for 5, 7 or more runs">
                <Text style={[styles.gridBtnNum, { color: DS.bg }]}>4</Text><Text style={[styles.gridBtnLabel, { color: DS.bg, opacity: 0.75 }]}>FOUR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnSix]} onPress={() => handleScore(6)} onLongPress={openOtherRuns}
                accessibilityRole="button"
                accessibilityLabel="Six"
                accessibilityHint="Hold for 5, 7 or more runs">
                <Text style={[styles.gridBtnNum, { color: DS.bg }]}>6</Text><Text style={[styles.gridBtnLabel, { color: DS.bg, opacity: 0.75 }]}>SIX</Text>
              </TouchableOpacity>
            </View>
          </View>
        }

        {/* ── WICKET — full width, always visible; asks the dismissal type ── */}
        {!matchComplete &&
        <TouchableOpacity style={[styles.wicketBtn, saving && styles.busyBlock]}
          disabled={saving}
          accessibilityRole="button" accessibilityLabel="Record a wicket"
          onPress={() => freeHit ? openRunOut() : setWicketPrompt(true)}>
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
      {/* A wicket/retirement leaves the crease empty, so a new batter is needed to
          score on — but the picker is dismissable (Cancel / back) so the scorer can
          reach UNDO without first choosing a throwaway batter. Trying to score with
          the slot still empty simply reopens it (see handleScore). */}
      <Modal visible={showPlayerModal} transparent animationType="slide" onRequestClose={closeBatterPicker}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              New Batsman{newBatterFor === 'nonstriker' ? ' (non-striker)' : ''}
            </Text>
            <Text style={styles.modalSub}>Tap the incoming batter, then confirm below</Text>
            <ScrollView>
              {getAvailableBatsmen().map((p, i) => {
                const resuming = retiredBatters.some((r) => r.id === p.id);   // retired hurt, coming back
                const picked = pendingBatter?.id === p.id;
                return (
                <TouchableOpacity key={i} style={[styles.playerOption, picked && styles.playerOptionPicked]}
                onPress={() => setPendingBatter(p)}>
                  <View style={[styles.playerAvatar, (resuming || picked) && { backgroundColor: DS.tintAccentStrong }]}>
                    <Text style={[styles.playerInitial, (resuming || picked) && { color: DS.lime }]}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.playerName, { flex: 1 }, picked && styles.playerNamePicked]}>{p.name}</Text>
                  {resuming && <Text style={[styles.modalSub, { marginBottom: 0, color: DS.lime }]}>retired · resume</Text>}
                  <Icon
                    name={picked ? 'check-circle' : 'checkbox-blank-circle-outline'}
                    size={18}
                    color={picked ? DS.lime : DS.textMuted} />
                </TouchableOpacity>);
              })}
            </ScrollView>
            <TouchableOpacity style={styles.squadAddBtn} onPress={() => openSquadAdd('bat')}>
              <Icon name="account-plus" size={18} color={DS.lime} />
              <Text style={styles.squadAddText}>Add from squad</Text>
            </TouchableOpacity>
            {/* The pick isn't live until this is pressed — a mis-tap in the list
                above costs nothing. */}
            <TouchableOpacity
              style={[styles.confirmBtn, !pendingBatter && styles.confirmBtnOff]}
              disabled={!pendingBatter}
              onPress={confirmBatter}>
              <Text style={[styles.confirmBtnText, !pendingBatter && styles.confirmBtnTextOff]}>
                {pendingBatter ? `Continue scoring · ${pendingBatter.name}` : 'Select a batter'}
              </Text>
            </TouchableOpacity>
            {/* Dismiss without picking → reach UNDO. Scoring stays gated until a
                batter is set (handleScore reopens this). */}
            <TouchableOpacity style={styles.modalClose} onPress={closeBatterPicker}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── BOWLER MODAL ── */}
      <Modal visible={showBowlerModal} transparent animationType="slide"
        onRequestClose={closeBowlerPicker}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{mustPickBowler ? 'Next Over — Pick Bowler' : 'Change Bowler'}</Text>
            <Text style={styles.modalSub}>
              Tap a bowler, then confirm · max {maxOversPerBowler} overs each · no consecutive overs
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
                  (mustPickBowler ? p.id !== lastOverBowlerId : p.id !== currentBowler?.id))
                  // Most recently bowled first. A bowling attack rotates between
                  // two ends, so picking for over 3 the man you want is over 1's
                  // bowler — over 2's is barred above by the consecutive rule.
                  // He used to sit wherever the XI listed him, which on a full
                  // squad meant hunting for a name you'd tapped two minutes ago.
                  // Bowlers who haven't bowled keep their XI order, after.
                  .slice().sort((a, b) => (bowlerLastOver[b.id] || 0) - (bowlerLastOver[a.id] || 0));
                if (eligible.length === 0) {
                  return <Text style={[styles.modalSub, { textAlign: 'center', marginVertical: 16 }]}>No eligible bowlers left.</Text>;
                }
                return eligible.map((p, i) => {
                  const picked = pendingBowler?.id === p.id;
                  return (
                  <TouchableOpacity key={i} style={[styles.playerOption, picked && styles.playerOptionPicked]}
                    onPress={() => setPendingBowler(p)}>
                    <View style={[styles.playerAvatar, { backgroundColor: DS.tintAccentStrong }]}>
                      <Text style={[styles.playerInitial, { color: DS.lime }]}>{p.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.playerName, { flex: 1 }, picked && styles.playerNamePicked]}>{p.name}</Text>
                    {/* Says WHY this name is at the top, so the order doesn't
                        look arbitrary. */}
                    {bowlerLastOver[p.id] ? (
                      <Text style={[styles.modalSub, { marginBottom: 0, marginRight: 8 }]}>
                        last ov {bowlerLastOver[p.id]}
                      </Text>
                    ) : null}
                    <Text style={[styles.modalSub, { marginBottom: 0 }]}>{bowlerOvers[p.id] || 0}/{maxOversPerBowler} ov</Text>
                    <Icon
                      name={picked ? 'check-circle' : 'checkbox-blank-circle-outline'}
                      size={18}
                      color={picked ? DS.lime : DS.textMuted} />
                  </TouchableOpacity>);
                });
              })()}
            </ScrollView>
            <TouchableOpacity style={styles.squadAddBtn} onPress={() => openSquadAdd('bowl')}>
              <Icon name="account-plus" size={18} color={DS.lime} />
              <Text style={styles.squadAddText}>Add from squad</Text>
            </TouchableOpacity>
            {/* The pick isn't live until this is pressed — a mis-tap in the list
                above costs nothing. */}
            <TouchableOpacity
              style={[styles.confirmBtn, !pendingBowler && styles.confirmBtnOff]}
              disabled={!pendingBowler}
              onPress={confirmBowler}>
              <Text style={[styles.confirmBtnText, !pendingBowler && styles.confirmBtnTextOff]}>
                {pendingBowler ? `Continue scoring · ${pendingBowler.name}` : 'Select a bowler'}
              </Text>
            </TouchableOpacity>
            {/* Always dismissable — including the mandatory next-over prompt — so the
                scorer can reach UNDO without first picking a bowler. The next-over
                bowler is still enforced when they try to score (handleScore rechecks
                eligibility at ball 0 and reopens this). */}
            <TouchableOpacity style={styles.modalClose} onPress={closeBowlerPicker}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── OVER COMPLETE — the between-overs break. Sits in front of the bowler
          picker rather than replacing it: the scorer sees what the over cost
          before choosing who bowls next. Suppressed while the New Batsman modal
          is up (a wicket on the last ball opens both). ── */}
      {/* ...and behind the shot sheet. The over summary is about what comes NEXT;
          the shot is about the ball that just happened. Asked the other way round,
          the sixth ball of every over was only asked about after the scorer had
          already picked the next bowler — and the last ball of an innings was
          never asked about at all, because the innings break got there first. */}
      <Modal visible={!!overComplete && !showPlayerModal && !pendingShot} transparent animationType="slide"
        onRequestClose={startNextOver}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, styles.ocSheet]}>
            <View style={styles.modalHandle} />

            {/* Body scrolls, buttons below stay pinned — on a short screen the
                cards would otherwise push "Start next over" out of reach. */}
            <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.ocHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ocTitle}>OVER {overComplete?.number} COMPLETE</Text>
                <Text style={styles.ocSub}>
                  <Text style={styles.ocSubNum}>{overComplete?.runs}</Text>
                  {` run${overComplete?.runs === 1 ? '' : 's'}`}
                  {overComplete?.wickets ? ` · ${overComplete.wickets} wicket${overComplete.wickets > 1 ? 's' : ''}` : ''}
                </Text>
              </View>
              {overComplete?.maiden &&
                <View style={styles.ocMaiden}><Text style={styles.ocMaidenText}>MAIDEN</Text></View>}
            </View>

            {/* The over, in the same chips as the live tracker. */}
            <View style={styles.ocBalls}>
              {(overComplete?.balls || []).map((b, i) => renderBallDot(b, i, false))}
            </View>

            {/* Who bowled it — this over's cost, then the full spell. */}
            <View style={styles.ocCard}>
              <View style={styles.ocRow}>
                <PlayerAvatar name={overComplete?.bowlerName || '?'} size={26} />
                <Text style={styles.ocRowName} numberOfLines={1}>{overComplete?.bowlerName || '—'}</Text>
                <Text style={styles.ocRowFig}>{figFor(overComplete?.bowlerId)}</Text>
              </View>
              <Text style={styles.ocRowNote}>
                {overComplete?.bowlerOverRuns} CHARGED THIS OVER · SPELL O-M-R-W
              </Text>
            </View>

            {/* At the crease — ends have already changed, so this is who faces next. */}
            <View style={styles.ocCard}>
              {[striker, nonStriker].filter(Boolean).map((p, i) => {
                const s = batStats[p.id] || { runs: 0, balls: 0 };
                return (
                  <View key={p.id} style={styles.ocRow}>
                    <PlayerAvatar name={p.name} avatarUrl={p.avatarUrl} size={26} />
                    <Text style={[styles.ocRowName, i === 0 && styles.ocRowNameStrike]} numberOfLines={1}>
                      {p.name}{i === 0 ? ' *' : ''}
                    </Text>
                    <Text style={styles.ocRowFig}>
                      {s.runs} <Text style={styles.ocRowFigSub}>({s.balls}){srOf(p.id) ? ` SR ${srOf(p.id)}` : ''}</Text>
                    </Text>
                  </View>
                );
              })}
              <Text style={styles.ocRowNote}>
                PARTNERSHIP {Math.max(0, currentScore.runs - pnrStartRuns)} ({pnrBalls})
              </Text>
            </View>

            {/* Where the match stands — and, in a chase, what's left to do. */}
            <View style={[styles.ocCard, styles.ocStateCard]}>
              <View style={styles.ocRow}>
                <Text style={styles.ocScore}>
                  {currentScore.runs}/{currentScore.wickets}
                  <Text style={styles.ocScoreSub}> ({currentScore.overs}.0)</Text>
                </Text>
                <Text style={styles.ocRowFig}>CRR <Text style={styles.ocRowFigLit}>{crr}</Text></Text>
              </View>
              {isInnings2 &&
                <Text style={styles.ocChase}>
                  Need <Text style={styles.ocChaseLit}>{need}</Text> off <Text style={styles.ocChaseLit}>{ballsLeft}</Text>
                  {rrr ? <Text> · RRR <Text style={styles.ocChaseLit}>{rrr}</Text></Text> : null}
                </Text>}
            </View>
            </ScrollView>

            <TouchableOpacity style={styles.confirmBtn} onPress={startNextOver}>
              <Text style={styles.confirmBtnText}>Start next over</Text>
            </TouchableOpacity>
            {/* The way out if the last ball was wrong — the over reopens on undo. */}
            <TouchableOpacity style={styles.modalClose}
              onPress={() => { setOverComplete(null); undoLastBall(); }}>
              <Text style={styles.modalCloseText}>Undo last ball</Text>
            </TouchableOpacity>
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

      {/* ── OTHER RUNS — anything the 0/1/2/3/4/6 pad can't express ── */}
      <Modal visible={runsPrompt} transparent animationType="slide" onRequestClose={() => setRunsPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Runs off the bat</Text>
            <Text style={styles.modalSub}>
              For overthrows and anything else the pad doesn't cover. Scores as a normal delivery.
            </Text>
            <View style={styles.runChipsGrid}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                <TouchableOpacity key={n} style={styles.runChipGrid}
                  onPress={() => { setRunsPrompt(false); handleScore(n); }}>
                  <Text style={styles.runChipNum}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setRunsPrompt(false)}>
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
              {/* 3 and 5 were missing: a wide the batters run 3 on, or byes that
                  reach the rope off an overthrow, are both legal and used to be
                  unrecordable. */}
              {(extraPrompt === 'bye' || extraPrompt === 'legbye' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5]).map((n) => (
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
                { label: 'bowled', icon: 'cricket', wt: 'bowled' },
                { label: 'caught', icon: 'hand-back-right', wt: 'caught' },
                { label: 'lbw', icon: 'target', wt: 'lbw' },
                { label: 'run out', icon: 'run-fast', wt: 'runout' },
                { label: 'stumped', icon: 'hand-back-left', wt: 'stumped' },
                { label: 'hit wicket', icon: 'alert', wt: 'hitwicket' },
                { label: 'retired', icon: 'bandage', wt: 'retired' },
                // The last three ways out in the Laws. Rare — a club season may
                // see none — but when one happens the scorer currently has to
                // file it as something it wasn't, and the scorecard then says a
                // batter was run out when he obstructed a fielder. Placed last
                // because they are rare, not because they are optional.
                { label: 'obstructing', icon: 'hand-front-right', wt: 'obstructing' },
                { label: 'timed out', icon: 'timer-sand', wt: 'timedout' },
                { label: 'hit ball twice', icon: 'repeat', wt: 'hitballtwice' },
              ].map(({ label: type, icon, wt }) => (
                <TouchableOpacity key={type} style={styles.wktChip}
                  onPress={() => {
                    setWicketPrompt(false);
                    // Run-out → which batter is out; caught → who caught; retired → who.
                    if (wt === 'runout') openRunOut();
                    else if (wt === 'caught') { setPendingCatcher(null); setCatchPrompt(true); }
                    else if (wt === 'retired') setRetiredPrompt(true);
                    // A stumping is the keeper's, by definition — and it was
                    // recorded with no fielder at all, so every one of them read
                    // "st keeper b Bowler" on the scorecard, with the word
                    // "keeper" standing in a name's place. If we know who is
                    // keeping, use them; if not, ask, exactly as caught behind
                    // does. This is also what makes a mid-match glove change
                    // safe: the dismissal keeps whoever actually did it, so a
                    // later swap can't rewrite an earlier stumping.
                    // A stumping is the keeper's, always — nobody is asked who
                    // did it while the answer is known. What IS asked is the
                    // delivery: a stumping off a wide is legal, and the wide
                    // has to keep its run and its non-ball.
                    else if (wt === 'stumped') setStumpDeliveryPrompt(true);
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

      {/* ── STUMPED — off which delivery? ──
          A stumping is the one dismissal besides a run out that can be made off
          a wide, and it is not rare: a ball down the leg side, a foot that
          drags, the bails off. The wide keeps its run and does not count as a
          delivery, so getting this wrong costs the over a ball.

          The keeper is not asked about — a stumping is by definition theirs, so
          it uses whoever is keeping and only asks when nobody has said. ── */}
      <Modal visible={stumpDeliveryPrompt} transparent animationType="slide" onRequestClose={() => setStumpDeliveryPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Stumped — off which delivery?</Text>
            <Text style={styles.modalSub}>
              {keeper ? `${keeper.name} takes the bails off` : "We'll ask who's keeping next"}
            </Text>
            <View style={styles.wktChips}>
              {[
                ['Legal ball', null, 'cricket'],
                ['Wide', 'wide', 'arrow-expand-horizontal'],
              ].map(([label, extra, icon]) => (
                <TouchableOpacity key={label} style={styles.wktChip}
                  onPress={() => {
                    setStumpDeliveryPrompt(false);
                    stumpExtra.current = extra;
                    if (keeper) handleScore('out', 0, 'stumped', 'striker', keeper.name, null, false, null, null, extra);
                    else { keeperFor.current = 'stumped'; setKeeperPrompt(true); }
                  }}>
                  <Icon name={icon} size={22} color={DS.wicketText} />
                  <Text style={styles.wktChipText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Back, not cancel — a wicket still has to be recorded. */}
            <TouchableOpacity style={styles.modalClose}
              onPress={() => { setStumpDeliveryPrompt(false); setWicketPrompt(true); }}>
              <Text style={styles.modalCloseText}>Back</Text>
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

      {/* ── RUN OUT · 1 of 4 — what was bowled, and how many runs were completed?
          Asked FIRST because it decides the rest: a wide or no ball isn't one of the
          over's six balls and keeps the free hit alive, and the runs completed before
          the wicket fell are scored (the one they were going for is not — Law 18.11). ── */}
      <Modal visible={runOutDeliveryPrompt} transparent animationType="slide" onRequestClose={() => setRunOutDeliveryPrompt(false)}>
        <View style={styles.modalOverlay}>
          {/* Taller than the standard sheet: three pickers plus their explanations,
              and the scorer must be able to reach Next without a scroll gamble. */}
          <View style={[styles.modalSheet, { maxHeight: '88%' }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Run out — what happened?</Text>
            <Text style={styles.modalSub}>The delivery, then the runs they completed</Text>
            <ScrollView keyboardShouldPersistTaps="handled">

            <Text style={styles.fieldLabel}>DELIVERY</Text>
            <View style={styles.segRow}>
              {[[DELIVERY.LEGAL, 'Legal ball'], [DELIVERY.WIDE, 'Wide'], [DELIVERY.NOBALL, 'No ball']].map(([d, label]) => (
                <TouchableOpacity key={d}
                  style={[styles.segBtn, runOutDraft?.delivery === d && styles.segBtnOn]}
                  onPress={() => {
                    haptic.tick();
                    setRunOutDraft((prev) => {
                      const next = { ...prev, delivery: d };
                      // A wide has no runs type at all, and a no ball doesn't split
                      // byes from leg byes — keep the draft on an option the sheet
                      // can actually show as selected.
                      if (d === DELIVERY.WIDE) next.runsType = RUNS.BAT;
                      if (d === DELIVERY.NOBALL && next.runsType === RUNS.LEGBYE) next.runsType = RUNS.BYE;
                      return next;
                    });
                  }}>
                  <Text style={[styles.segText, runOutDraft?.delivery === d && styles.segTextOn]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Law 38.3 — the bowler takes the bails off with the non-striker backing
                up. No ball has been bowled, so nothing is scored and the over is
                untouched; the batter out can only be the non-striker. */}
            <TouchableOpacity
              style={[styles.segWide, runOutDraft?.delivery === DELIVERY.NONE && styles.segBtnOn]}
              onPress={() => { haptic.tick(); patchRunOut({ delivery: DELIVERY.NONE, runs: 0, runsType: RUNS.BAT, outSlot: END.NONSTRIKER, end: END.NONSTRIKER }); }}>
              <Text style={[styles.segText, runOutDraft?.delivery === DELIVERY.NONE && styles.segTextOn]}>
                Before the ball was bowled — non-striker backing up
              </Text>
            </TouchableOpacity>

            {runOutDraft?.delivery !== DELIVERY.NONE && <>
              <Text style={styles.fieldLabel}>RUNS COMPLETED</Text>
              <View style={styles.segRow}>
                {[0, 1, 2, 3, 4].map((n) => (
                  <TouchableOpacity key={n}
                    style={[styles.segBtn, runOutDraft?.runs === n && styles.segBtnOn]}
                    onPress={() => { haptic.tick(); patchRunOut({ runs: n }); }}>
                    <Text style={[styles.segText, runOutDraft?.runs === n && styles.segTextOn]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.modalSub}>
                Runs they got home for. The run they were going for when the wicket fell doesn't count.
              </Text>
            </>}

            {/* How those runs are credited. A wide has no choice to make — every run
                run off it is a wide (Law 22.5). A no ball has only two: off the bat
                (the striker's runs) or not, and anything not off the bat is still a
                no-ball extra rather than a bye (Law 21.13). */}
            {runOutDraft?.runs > 0 && runOutDraft?.delivery !== DELIVERY.WIDE && runOutDraft?.delivery !== DELIVERY.NONE && <>
              <Text style={styles.fieldLabel}>THE RUNS WERE</Text>
              <View style={styles.segRow}>
                {(runOutDraft?.delivery === DELIVERY.NOBALL
                  ? [[RUNS.BAT, 'Off the bat'], [RUNS.BYE, 'Not off the bat']]
                  : [[RUNS.BAT, 'Off the bat'], [RUNS.BYE, 'Byes'], [RUNS.LEGBYE, 'Leg byes']]
                ).map(([t, label]) => (
                  <TouchableOpacity key={t}
                    style={[styles.segBtn, runOutDraft?.runsType === t && styles.segBtnOn]}
                    onPress={() => { haptic.tick(); patchRunOut({ runsType: t }); }}>
                    <Text style={[styles.segText, runOutDraft?.runsType === t && styles.segTextOn]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {runOutDraft?.delivery === DELIVERY.NOBALL && runOutDraft?.runsType !== RUNS.BAT && (
                <Text style={styles.modalSub}>Recorded as no-ball extras, not byes (Law 21.13)</Text>
              )}
            </>}

            <TouchableOpacity style={styles.confirmBtn}
              onPress={() => {
                setRunOutDeliveryPrompt(false);
                // Law 38.3 leaves nothing to ask: it can only be the non-striker, at
                // the bowler's end — straight to who effected it.
                if (runOutDraft?.delivery === DELIVERY.NONE) setRunOutFielderPrompt(true);
                else setRunOutPrompt(true);
              }}>
              <Text style={styles.confirmBtnText}>Next</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalClose} onPress={() => { setRunOutDeliveryPrompt(false); setRunOutDraft(null); }}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── RUN OUT · 2 of 4 — which batter is out? Named by where they STARTED the
          delivery; after an odd number of completed runs they've swapped ends, which
          the row says out loud so the scorer picks the right man. ── */}
      <Modal visible={runOutPrompt} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Run out — who is out?</Text>
            <Text style={styles.modalSub}>
              {runOutDraft?.runs ? `After ${runOutDraft.runs} run${runOutDraft.runs === 1 ? '' : 's'} completed` : 'Which batter was run out'}
            </Text>
            {[[END.STRIKER, striker], [END.NONSTRIKER, nonStriker]].map(([slot, player]) => {
              // An odd number of completed runs has already turned them round.
              const swapped = (runOutDraft?.runs || 0) % 2 === 1;
              const atStriker = swapped ? slot === END.NONSTRIKER : slot === END.STRIKER;
              return (
                <TouchableOpacity key={slot} style={styles.settingRow}
                  onPress={() => { patchRunOut({ outSlot: slot }); setRunOutPrompt(false); setRunOutEndPrompt(true); }}>
                  <View style={[styles.playerAvatar, { backgroundColor: DS.wicketBg }]}>
                    <Text style={[styles.playerInitial, { color: DS.wicketText }]}>{(player?.name || '?').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingTextNoFlex}>
                      {player?.name || '—'} <Text style={styles.modalSub}>({slot === END.STRIKER ? 'struck the ball' : 'non-striker'})</Text>
                    </Text>
                    {swapped && (
                      <Text style={styles.rowHint}>now at the {atStriker ? "striker's" : "bowler's"} end</Text>
                    )}
                  </View>
                  <Icon name="chevron-right" size={18} color={DS.textMuted} />
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.modalClose} onPress={() => { setRunOutPrompt(false); setRunOutDeliveryPrompt(true); }}>
              <Text style={styles.modalCloseText}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── RUN OUT · 3 of 4 — which end was the wicket put down at? This is the
          question that decides the crease. Whichever end the bails came off, the
          batter who is out was short of THAT end, so the incoming batter walks in
          there and the not-out batter is at the other end (Law 18.12) — which is
          also why the completed runs don't come into it. Each row spells out who
          ends up on strike, so nobody has to reason it through mid-over. ── */}
      <Modal visible={runOutEndPrompt} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Where was the wicket put down?</Text>
            <Text style={styles.modalSub}>
              {(runOutDraft?.outSlot === END.NONSTRIKER ? nonStriker?.name : striker?.name) || 'The batter'} was short of that end
            </Text>
            {[[END.STRIKER, "Striker's end", "The keeper's end — where the ball was faced"],
              [END.NONSTRIKER, "Bowler's end", 'The end the bowler runs in from']].map(([end, label, hint]) => (
              <TouchableOpacity key={end} style={styles.settingRow}
                onPress={() => { patchRunOut({ end }); setRunOutEndPrompt(false); setRunOutFielderPrompt(true); }}>
                <View style={[styles.playerAvatar, { backgroundColor: DS.surfaceHigh }]}>
                  <Icon name={end === END.STRIKER ? 'hand-back-left' : 'cricket'} size={16} color={DS.textVariant} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingTextNoFlex}>{label}</Text>
                  <Text style={styles.rowHint}>{hint}</Text>
                  <Text style={[styles.rowHint, { color: DS.lime }]}>
                    New batter in here · {strikeAfterRunOut(runOutDraft, end)}
                  </Text>
                </View>
                <Icon name="chevron-right" size={18} color={DS.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalClose} onPress={() => { setRunOutEndPrompt(false); setRunOutPrompt(true); }}>
              <Text style={styles.modalCloseText}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── RUN OUT · 4 of 4 — which fielder effected it? Commits the ball, so
          "Not sure / no fielder" is the completion path and there's no Cancel. ── */}
      <Modal visible={runOutFielderPrompt} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Run out — which fielder?</Text>
            <Text style={styles.modalSub}>Who effected the run out</Text>
            {/* Answered before the fielder is picked, because picking one
                commits the ball. */}
            <TouchableOpacity
              style={[styles.directHitRow, runOutDirectHit && styles.directHitRowOn]}
              onPress={() => setRunOutDirectHit((v) => !v)}
              activeOpacity={0.85}>
              <Icon name={runOutDirectHit ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={20} color={runOutDirectHit ? DS.lime : DS.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.directHitLabel}>Direct hit</Text>
                <Text style={styles.directHitHint}>
                  Hit the stumps directly — the fielder takes full credit for the wicket
                </Text>
              </View>
            </TouchableOpacity>
            <ScrollView style={{ maxHeight: 280 }}>
              {bowlingXI.map((p, i) => (
                <TouchableOpacity key={i} style={styles.playerOption} onPress={() => commitRunOut(p.name)}>
                  <View style={styles.playerAvatar}>
                    <Text style={styles.playerInitial}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.playerName, { flex: 1 }]}>{p.name}</Text>
                  {p.id === keeper?.id && <Text style={styles.settingHint}>WK</Text>}
                  <Icon name="chevron-right" size={18} color={DS.textMuted} />
                </TouchableOpacity>
              ))}
              {/* Fall back to no fielder credit (e.g. direct-hit uncertainty) */}
              <TouchableOpacity style={styles.playerOption} onPress={() => commitRunOut(null)}>
                <View style={[styles.playerAvatar, { backgroundColor: DS.surfaceHigh }]}>
                  <Icon name="help" size={16} color={DS.textMuted} />
                </View>
                <Text style={[styles.playerName, { flex: 1 }]}>Not sure / no fielder</Text>
                <Icon name="chevron-right" size={18} color={DS.textMuted} />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── DROPPED CATCH · 1 of 3 — who put it down? ── */}
      <Modal visible={dropFielderPrompt} transparent animationType="slide" onRequestClose={() => setDropFielderPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Dropped catch — who?</Text>
            <Text style={styles.modalSub}>The fielder who put the chance down</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {bowlingXI.map((p, i) => (
                <TouchableOpacity key={i} style={styles.playerOption}
                  onPress={() => { setDropDraft({ by: p.name }); setDropFielderPrompt(false); setDropDifficultyPrompt(true); }}>
                  <View style={styles.playerAvatar}>
                    <Text style={styles.playerInitial}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.playerName, { flex: 1 }]}>{p.name}</Text>
                  {p.id === keeper?.id && <Text style={styles.settingHint}>WK</Text>}
                  <Icon name="chevron-right" size={18} color={DS.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setDropFielderPrompt(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── DROPPED CATCH · 2 of 3 — a sitter or a screamer? ── */}
      <Modal visible={dropDifficultyPrompt} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>How hard was the chance?</Text>
            <Text style={styles.modalSub}>{dropDraft?.by} — this is what the commentary will say</Text>
            {[
              ['easy', 'Easy chance', 'Straight to hand — should have been taken', 'emoticon-sad-outline'],
              ['difficult', 'Difficult chance', 'Half a chance — diving, in the deep, sharp', 'hand-back-right-outline'],
            ].map(([key, label, hint, icon]) => (
              <TouchableOpacity key={key} style={styles.settingRow}
                onPress={() => { setDropDraft((d) => ({ ...d, difficulty: key })); setDropDifficultyPrompt(false); setDropRunsPrompt(true); }}>
                <Icon name={icon} size={20} color={key === 'easy' ? DS.coral : DS.lime} />
                {/* settingText carries flex:1 because it is built to be a direct
                    child of the ROW. Inside this column it took the whole height
                    and the hint drew on top of the label. */}
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingTextNoFlex}>{label}</Text>
                  <Text style={[styles.settingHint, { marginTop: 3, marginRight: 0 }]}>{hint}</Text>
                </View>
                <Icon name="chevron-right" size={18} color={DS.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalClose}
              onPress={() => { setDropDifficultyPrompt(false); setDropFielderPrompt(true); }}>
              <Text style={styles.modalCloseText}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── DROPPED CATCH · 3 of 3 — runs off the ball. This commits it, so there
          is no Cancel: 0 is a real answer and the way out. ── */}
      <Modal visible={dropRunsPrompt} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Runs off the ball?</Text>
            <Text style={styles.modalSub}>
              {dropDraft?.by} put down {dropDraft?.difficulty === 'easy' ? 'an easy' : 'a difficult'} chance
            </Text>
            <View style={styles.dropRunsRow}>
              {[0, 1, 2, 3, 4, 6].map((n) => (
                <TouchableOpacity key={n} style={styles.dropRunBtn} onPress={() => commitDrop(n)} activeOpacity={0.85}>
                  <Text style={styles.dropRunText}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalSub}>
              A drop scores nothing for or against anyone — it's recorded so the commentary can tell the story.
            </Text>
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
                <View style={[styles.playerAvatar, { backgroundColor: DS.tintAccentStrong }]}>
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
            <Text style={styles.modalSub}>
              Tap one, then confirm — {(retiredSlot === 'nonstriker' ? nonStriker : striker)?.name || 'the batter'} leaves the crease either way.
            </Text>
            <TouchableOpacity
              style={[styles.settingRow, pendingRetireKind === 'hurt' && styles.settingRowPicked]}
              onPress={() => setPendingRetireKind('hurt')}>
              <View style={[styles.playerAvatar, { backgroundColor: DS.tintAccentStrong }]}>
                <Icon name="bandage" size={16} color={DS.lime} />
              </View>
              <Text style={[styles.settingText, { flex: 1 }]}>Retired hurt <Text style={styles.modalSub}>(not out · can return)</Text></Text>
              <Icon
                name={pendingRetireKind === 'hurt' ? 'check-circle' : 'checkbox-blank-circle-outline'}
                size={18}
                color={pendingRetireKind === 'hurt' ? DS.lime : DS.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.settingRow, pendingRetireKind === 'out' && styles.settingRowPickedDanger]}
              onPress={() => setPendingRetireKind('out')}>
              <View style={[styles.playerAvatar, { backgroundColor: DS.wicketBg }]}>
                <Icon name="flag-checkered" size={16} color={DS.wicketText} />
              </View>
              <Text style={[styles.settingText, { flex: 1, color: DS.wicketText }]}>Retired out <Text style={styles.modalSub}>(counts as a wicket)</Text></Text>
              <Icon
                name={pendingRetireKind === 'out' ? 'check-circle' : 'checkbox-blank-circle-outline'}
                size={18}
                color={pendingRetireKind === 'out' ? DS.wicketText : DS.textMuted} />
            </TouchableOpacity>
            {/* Two rows a thumb-width apart with opposite consequences — one costs a
                wicket, the other doesn't. Neither fires until this is pressed. */}
            <TouchableOpacity
              style={[styles.confirmBtn,
                !pendingRetireKind && styles.confirmBtnOff,
                pendingRetireKind === 'out' && styles.confirmBtnDanger]}
              disabled={!pendingRetireKind}
              onPress={() => {
                if (pendingRetireKind === 'out') retireOut(retiredSlot);
                else retireBatsman(retiredSlot);
              }}>
              <Text style={[styles.confirmBtnText,
                !pendingRetireKind && styles.confirmBtnTextOff,
                pendingRetireKind === 'out' && { color: DS.onBlue }]}>
                {pendingRetireKind === 'out' ? 'Confirm · retired OUT (wicket)'
                  : pendingRetireKind === 'hurt' ? 'Confirm · retired hurt'
                  : 'Pick hurt or out'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalClose} onPress={() => setRetiredKindPrompt(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── CAUGHT — who took the catch? (c&b / keeper / fielder). Mandatory once
          "caught" is chosen. Tapping a name only ARMS the catcher — the wicket goes
          down when the button below is pressed. A stray tap in a scrolling XI used
          to record the wicket against the wrong fielder outright, and the only way
          back was to undo the delivery. ── */}
      <Modal visible={catchPrompt} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Who took the catch?</Text>
            <Text style={styles.modalSub}>Caught &amp; bowled, keeper, or a fielder</Text>
            {/* Caught & bowled — the bowler catches their own delivery */}
            <TouchableOpacity
              style={[styles.settingRow, pendingCatcher?.kind === 'cb' && styles.settingRowPicked]}
              onPress={() => armCatcher({ kind: 'cb', name: currentBowler?.name, id: currentBowler?.id })}>
              <View style={[styles.playerAvatar, { backgroundColor: DS.wicketBg }]}>
                <Icon name="cricket" size={16} color={DS.wicketText} />
              </View>
              <Text style={[styles.settingText, { flex: 1 }]}>Caught &amp; Bowled <Text style={styles.modalSub}>({currentBowler?.name})</Text></Text>
              {pendingCatcher?.kind === 'cb'
                ? <Icon name="check-circle" size={18} color={DS.lime} />
                : <Icon name="chevron-right" size={18} color={DS.textMuted} />}
            </TouchableOpacity>
            {/* Caught behind — the commonest catch of all, so it gets its own row
                instead of a scroll through the XI. The keeper is filled in for the
                scorer; only an XI that doesn't name one asks who's keeping. */}
            <TouchableOpacity
              style={[styles.settingRow, pendingCatcher?.kind === 'keeper' && styles.settingRowPicked]}
              onPress={() => {
                if (keeper) armCatcher({ kind: 'keeper', name: keeper.name, id: keeper.id });
                else { setCatchPrompt(false); keeperFor.current = 'catch'; setKeeperPrompt(true); }
              }}>
              <View style={[styles.playerAvatar, { backgroundColor: DS.wicketBg }]}>
                <Icon name="hand-back-left" size={16} color={DS.wicketText} />
              </View>
              <Text style={[styles.settingText, { flex: 1 }]}>
                Caught Behind <Text style={styles.modalSub}>({keeper ? keeper.name : 'pick the keeper'})</Text>
              </Text>
              {pendingCatcher?.kind === 'keeper'
                ? <Icon name="check-circle" size={18} color={DS.lime} />
                : <Icon name="chevron-right" size={18} color={DS.textMuted} />}
            </TouchableOpacity>
            {/* Any fielder / keeper from the bowling XI (excluding the bowler) */}
            <ScrollView style={{ maxHeight: 260 }}>
              {bowlingXI.filter((p) => p.id !== currentBowler?.id).map((p, i) => {
                const picked = pendingCatcher?.kind === 'fielder' && pendingCatcher.id === p.id;
                return (
                  <TouchableOpacity key={i}
                    style={[styles.playerOption, picked && styles.playerOptionPicked]}
                    onPress={() => armCatcher({ kind: 'fielder', name: p.name, id: p.id })}>
                    <View style={styles.playerAvatar}>
                      <Text style={styles.playerInitial}>{p.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.playerName, { flex: 1 }, picked && styles.playerNamePicked]}>{p.name}</Text>
                    {p.id === keeper?.id && <Text style={styles.settingHint}>WK</Text>}
                    {picked
                      ? <Icon name="check-circle" size={18} color={DS.lime} />
                      : <Icon name="chevron-right" size={18} color={DS.textMuted} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {/* Says exactly what goes in the book — "c Maxwell b Starc" — so the
                scorer confirms the scorecard line, not just a name. */}
            <TouchableOpacity
              style={[styles.confirmBtn, !pendingCatcher && styles.confirmBtnOff]}
              disabled={!pendingCatcher}
              onPress={commitCatch}>
              <Text style={[styles.confirmBtnText, !pendingCatcher && styles.confirmBtnTextOff]}>
                {pendingCatcher ? `Confirm wicket · ${catchNotation(pendingCatcher)}` : 'Pick who took the catch'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── CAUGHT BEHIND — only when the XI doesn't name a keeper (or names more
          than one). Asked once: the pick is remembered for the rest of the innings,
          so every later caught behind arms straight away. This sheet only answers
          "who has the gloves on" — it hands back to the catch sheet, where the
          wicket is confirmed like any other catch. ── */}
      <Modal visible={keeperPrompt} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Who's keeping wicket?</Text>
            <Text style={styles.modalSub}>
              {keeperFor.current === 'change'
                ? 'Remembered for this innings, and shown on the scorecard'
                : `Recorded as ${keeperFor.current === 'stumped' ? 'the stumping' : 'caught behind'} — remembered for this innings`}
            </Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {bowlingXI.filter((p) => p.id !== currentBowler?.id).map((p, i) => (
                <TouchableOpacity key={i} style={styles.playerOption}
                  onPress={() => {
                    const why = keeperFor.current;
                    pickKeeper(p.id);
                    setKeeperPrompt(false);
                    // Three ways in: finish the catch, finish the stumping, or
                    // nothing more to do because the gloves simply changed hands.
                    if (why === 'stumped') handleScore('out', 0, 'stumped', 'striker', p.name, null, false, null, null, stumpExtra.current);
                    else if (why === 'catch') { armCatcher({ kind: 'keeper', name: p.name, id: p.id }); setCatchPrompt(true); }
                  }}>
                  <View style={styles.playerAvatar}>
                    <Text style={styles.playerInitial}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.playerName, { flex: 1 }]}>{p.name}</Text>
                  <Icon name="chevron-right" size={18} color={DS.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            {/* Back, not out — a wicket still has to be recorded, so this
                returns to the sheet it came from rather than cancelling. */}
            <TouchableOpacity style={styles.modalClose}
              onPress={() => {
                setKeeperPrompt(false);
                if (keeperFor.current === 'catch') setCatchPrompt(true);
                else if (keeperFor.current === 'stumped') setStumpDeliveryPrompt(true);
              }}>
              <Text style={styles.modalCloseText}>Back</Text>
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

            {/* Change keeper — beside Change bowler, because it is the same kind
                of thing: who is doing a job right now. The keeper gets hit, or
                takes the ball for a few overs, and until this there was no way
                to say so except by taking a catch. */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => { setMorePrompt(false); keeperFor.current = 'change'; setKeeperPrompt(true); }}>
              <Icon name="hand-back-left" size={20} color={DS.lime} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTextNoFlex}>Change keeper</Text>
                <Text style={styles.settingHint}>{keeper ? keeper.name : 'nobody named yet'}</Text>
              </View>
            </TouchableOpacity>
            {/* Swap strike — the manual correction for the ends. The ends normally
                look after themselves (odd runs, end of over, a run out), but nothing
                else can fix a mix-up the scorer only spots a ball later, or the rare
                case both batters end up at the same end. Reversible in one tap, so
                it commits straight away. */}
            <TouchableOpacity
              style={[styles.settingRow, !canSwapStrike && { opacity: 0.4 }]}
              disabled={!canSwapStrike}
              onPress={swapStrike}>
              <Icon name="swap-horizontal" size={20} color={DS.lime} />
              <Text style={styles.settingText}>Swap strike</Text>
              <Text style={styles.settingHint} numberOfLines={1}>
                {canSwapStrike ? `${nonStriker.name} faces` : 'both batters needed'}
              </Text>
              <Icon name="chevron-right" size={18} color={DS.textMuted} />
            </TouchableOpacity>
            {/* Short run — only lit when the last ball was 2 or 3 runs run. */}
            <TouchableOpacity
              // Greyed while a delivery is in flight too, so the guard in
              // applyShortRun is something the scorer can SEE rather than a tap
              // that does nothing.
              style={[styles.settingRow, (!shortRunEligible || saving) && { opacity: 0.4 }]}
              disabled={!shortRunEligible || saving}
              onPress={() => { setMorePrompt(false); setShortRunPrompt(true); }}>
              <Icon name="call-split" size={20} color={DS.coral} />
              <Text style={styles.settingText}>Short run</Text>
              <Text style={styles.settingHint}>
                {shortRunEligible ? `${shortRunAttempt} → ${shortRunAttempt - 1}` : 'last ball 2 or 3'}
              </Text>
              <Icon name="chevron-right" size={18} color={DS.textMuted} />
            </TouchableOpacity>
            {/* Dropped catch — not a wicket, so it can't go on the wicket pad, and
                not an extra. It scores nothing; it's recorded so the commentary
                can say why the batter is still in. Ends by asking the runs,
                which commits the delivery. */}
            <TouchableOpacity
              style={[styles.settingRow, !scoringReady && { opacity: 0.4 }]}
              disabled={!scoringReady}
              onPress={() => { setMorePrompt(false); setDropFielderPrompt(true); }}>
              <Icon name="hand-back-left-outline" size={20} color={DS.coral} />
              <Text style={styles.settingText}>Dropped catch</Text>
              <Text style={styles.settingHint}>chance put down</Text>
              <Icon name="chevron-right" size={18} color={DS.textMuted} />
            </TouchableOpacity>
            {/* Other runs — 5 off the bat, 7, anything the pad can't express.
                Also reachable by long-pressing any run button. */}
            <TouchableOpacity
              style={[styles.settingRow, !scoringReady && { opacity: 0.4 }]}
              disabled={!scoringReady}
              onPress={() => { setMorePrompt(false); setRunsPrompt(true); }}>
              <Icon name="numeric" size={20} color={DS.lime} />
              <Text style={styles.settingText}>Other runs</Text>
              <Text style={styles.settingHint}>5, 7 · overthrows</Text>
              <Icon name="chevron-right" size={18} color={DS.textMuted} />
            </TouchableOpacity>
            {/* Penalty 5 — a team award (helmet hit etc.), not a delivery. Rare
                enough that it lives here rather than in the extras row. */}
            <TouchableOpacity
              style={[styles.settingRow, !scoringReady && { opacity: 0.4 }]}
              disabled={!scoringReady}
              onPress={() => { setMorePrompt(false); setPenaltyPrompt(true); }}>
              <Icon name="alert-octagon-outline" size={20} color={DS.coral} />
              <Text style={styles.settingText}>Penalty 5 runs</Text>
              <Text style={styles.settingHint}>team award</Text>
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

      {/* ── SHORT RUN — confirm the accidental short run on the last ball ── */}
      <Modal visible={shortRunPrompt} transparent animationType="fade" onRequestClose={() => setShortRunPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Short Run</Text>
            <Text style={styles.modalSub}>
              One run wasn't grounded. Award {shortRunAttempt - 1} instead of {shortRunAttempt}? The ball still counts and the batters keep their ends.
            </Text>
            <View style={styles.shortRunCalc}>
              <Text style={styles.shortRunCalcNum}>{shortRunAttempt}</Text>
              <Icon name="arrow-right-thin" size={22} color={DS.textMuted} />
              <Text style={[styles.shortRunCalcNum, { color: DS.coral }]}>{shortRunAttempt - 1}</Text>
            </View>
            <View style={styles.yesNoRow}>
              <TouchableOpacity style={[styles.yesNoBtn, styles.noBtn]} onPress={() => setShortRunPrompt(false)}>
                <Text style={styles.noBtnText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.yesNoBtn, styles.yesBtn]}
                onPress={() => { setShortRunPrompt(false); applyShortRun(); }}>
                <Text style={styles.yesBtnText}>Yes, short run</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MATCH SETTINGS sheet (⚙) — End Innings/Match lives here ── */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Match Settings</Text>

            {/* Sunlight mode lives HERE rather than in app settings, because it
                is a scoring decision, not a preference: you turn it on when you
                walk out into the sun and off when you come in. Putting it three
                screens away in a profile would mean nobody uses it at the only
                moment it helps. It is a real third theme, not a brightness
                slider — pure black on white, no greys, boundaries as filled
                blocks. */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={toggleSunlight}
              accessibilityRole="switch"
              accessibilityLabel="Sunlight mode, scoring screen only"
              accessibilityState={{ checked: sunOn }}
            >
              <Icon name={sunOn ? 'white-balance-sunny' : 'weather-sunny'}
                size={20} color={sunOn ? DS.lime : DS.textPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTextNoFlex}>Sunlight mode</Text>
                <Text style={styles.settingHint}>
                  {sunOn
                    ? 'On — this screen only, rest of the app unchanged'
                    : 'Max contrast for scoring outdoors'}
                </Text>
              </View>
              <View style={[styles.sunPill, sunOn && styles.sunPillOn]}>
                <Text style={[styles.sunPillText, sunOn && styles.sunPillTextOn]}>
                  {sunOn ? 'ON' : 'OFF'}
                </Text>
              </View>
            </TouchableOpacity>

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
            <Text style={styles.modalSub}>
              {isInnings2
                ? 'Tap a reason, then confirm. This completes the match — it can\'t be undone.'
                : 'Tap a reason, then confirm. This closes the innings — it can\'t be undone.'}
            </Text>
            {(isInnings2 ? END_REASONS.match : END_REASONS.innings).map((reason) => {
              const picked = pendingEndReason === reason;
              return (
              <TouchableOpacity key={reason} style={[styles.settingRow, picked && styles.settingRowPickedDanger]}
                onPress={() => setPendingEndReason(reason)}>
                <Icon name="flag-outline" size={18} color={DS.coral} />
                <Text style={[styles.settingText, { flex: 1 }, picked && { color: DS.coral }]}>{reason}</Text>
                <Icon
                  name={picked ? 'check-circle' : 'checkbox-blank-circle-outline'}
                  size={18}
                  color={picked ? DS.coral : DS.textMuted} />
              </TouchableOpacity>);
            })}
            {/* Nothing happens until this is pressed — finishInnings() creates the
                second innings (or completes the match) and there's no way back. */}
            <TouchableOpacity
              style={[styles.confirmBtn, pendingEndReason ? styles.confirmBtnDanger : styles.confirmBtnOff]}
              disabled={!pendingEndReason}
              onPress={() => {
                const reason = pendingEndReason;
                setEndPrompt(false);
                finishInnings(reason);
              }}>
              <Text style={[styles.confirmBtnText, !pendingEndReason && styles.confirmBtnTextOff, pendingEndReason && { color: DS.onBlue }]}>
                {pendingEndReason
                  ? `${isInnings2 ? 'End match' : 'End innings'} · ${pendingEndReason}`
                  : 'Pick a reason'}
              </Text>
            </TouchableOpacity>
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

      {/* ── Ball Intelligence: "where did it go?" ────────────────────────────
          Waits its turn rather than stacking. After a wicket the scorer must
          pick the new batter, and after the sixth ball a new bowler — those
          block play and this does not, so it holds until they are answered and
          the delivery is fully dealt with. The captured shot is queued, not
          awaited: nothing on this screen blocks on it landing. */}
      <BallIntelligenceSheet
        visible={
          !!pendingShot && !showPlayerModal && !showBowlerModal
          && !matchComplete && !showExitModal
        }
        ball={pendingShot}
        batterName={pendingShot?.batterName}
        hand={pendingShot?.hand || 'right'}
        initialShot={pendingShot?.captured || null}
        onCapture={(shot) => {
          if (!pendingShot || !matchData?.id) return;
          enqueueShot(matchData.id, {
            clientEventId: pendingShot.clientEventId,
            shotAngle: shot.angle,
            shotDistance: shot.distance,
            shotType: shot.shotType,
            connectionType: shot.connectionType,
            lofted: shot.lofted,
            selectedShotRank: shot.selectedShotRank,
            rankingEngineVersion: shot.rankingEngineVersion,
          });
          // Remember what was recorded so reopening this delivery via SHOT shows
          // the existing pick instead of a blank wheel. Matched on clientEventId
          // so a capture can never write itself onto a different delivery.
          setLastShot((s) => (s && s.clientEventId === pendingShot.clientEventId
            ? { ...s, captured: shot } : s));
        }}
        onClose={() => setPendingShot(null)}
      />
    </View>);

}

const GRID_BTN = (width - 48) / 3;

// The extras row computes to about 37pt tall — under the 44pt a thumb wants —
// and this screen does not scroll, so the space to grow into does not exist:
// taller buttons here would come straight out of the runs grid, which is hit far
// more often. hitSlop buys the missing height in the touch layer instead, where
// it costs no pixels. Vertical only; horizontally these are already wide, and
// spreading sideways would overlap the neighbouring button's slop.
const EXTRA_HIT = { top: 6, bottom: 6, left: 0, right: 0 };

const makeStyles = (DS) => {
  const CK = cricketColors(DS);
  return StyleSheet.create({
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
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: DS.tintDanger, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
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
  sbRateNum: { color: DS.textVariant, fontWeight: '900' },   // PROJ — quieter than CRR
  sbScorecardLink: { fontSize: 11.5, fontWeight: '800', color: DS.blue },
  // 2nd-innings chase pill: need · balls · RRR, loud.
  chaseStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 6, backgroundColor: DS.tintDanger, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 4 },
  chaseNeed: { fontSize: 12.5, fontWeight: '900', color: DS.coral, letterSpacing: 0.5 },
  chaseBig: { fontSize: 16, fontWeight: '900', color: DS.coral },
  chaseNum: { fontWeight: '900', color: DS.coral },
  chaseMeta: { fontSize: 12, fontWeight: '700', color: DS.coral },
  chaseSep: { width: 3, height: 3, borderRadius: 2, backgroundColor: DS.coral, opacity: 0.5 },
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
  // The one thing in this row that MAY be trimmed. Priority when the width runs
  // out is: the run total holds (it is the reading), the status pills hold (they
  // are already icons), and this gives way — a band showing ball chips under a
  // green tick is obviously the current over even if the words are clipped.
  overLabel: { fontSize: 10, fontWeight: '800', color: DS.textVariant, letterSpacing: 1.1, flexShrink: 1 },
  // flexShrink 0: the runs in this over are the reading the whole band exists
  // for, and it must not be what collapses when something else is added beside
  // it. Anything new in this row has to earn its width against the pills, not
  // against the score.
  overSummary: { flexShrink: 0, textAlign: 'right', paddingLeft: 6 },
  overSummaryRuns: { fontSize: 14, fontWeight: '900', color: DS.lime, letterSpacing: -0.2 },
  overSummaryUnit: { fontSize: 10.5, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.2 },

  // ── Crease panel — striker (lit) / non-striker / bowler ──
  creasePanel: { backgroundColor: DS.surfaceHigh, borderRadius: 16, marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 2, marginBottom: 6 },
  creaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  // On-strike batter is lifted with a faint lime wash + rounded ends so the eye
  // lands on who's facing without reading names.
  creaseStrikerRow: { backgroundColor: DS.tintAccent, borderRadius: 10, marginHorizontal: -6, paddingHorizontal: 6 },
  creaseAvatar: { marginLeft: -2 },
  creaseRowDivider: { paddingTop: 3 },
  pnrRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5, marginTop: 2, borderTopWidth: 1, borderTopColor: DS.line },
  pnrLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: DS.textMuted },
  pnrFig: { fontSize: 13, fontWeight: '800', color: DS.textPrimary },
  pnrFigSub: { fontSize: 12, fontWeight: '700', color: DS.textMuted },
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
  // Dropping PEN 5 gave this row a whole slot back. It goes to the four extras
  // (all flex:1) as a taller target and a bigger label — these are hit every
  // over, and at 10.5pt in a sixth of the row they were the smallest live
  // controls on the screen.
  extraBtn: {
    flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 11, paddingVertical: 11,
    alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1, borderColor: DS.line,
  },
  extraBtnText: { fontSize: 12.5, fontWeight: '800', color: DS.textVariant, letterSpacing: 0.3, textAlign: 'center' },
  // UNDO is a correction control, not an extra — coral-tinted so it reads apart
  // from the neutral WD/NB/BYE/LB buttons beside it, and its label carries the
  // last delivery (what it will remove).
  undoBtn: { flex: 2, flexDirection: 'row', gap: 4, paddingHorizontal: 4, backgroundColor: DS.tintDanger, borderColor: DS.borderDanger },
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
    backgroundColor: DS.tintAccent, borderWidth: 1, borderColor: DS.borderAccent,
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
  // Six chips per row now (3 and 5 were added), so they're tighter than the old
  // four — still a comfortable target, just less air around the number.
  runChips: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  runChip: { flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  runChipNum: { fontSize: 21, fontWeight: '900', color: DS.textPrimary },
  // "Other runs" sheet — 0–7 wraps onto two rows of four.
  runChipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  runChipGrid: {
    width: '22.6%', backgroundColor: DS.surfaceHigh, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },

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
  sunPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    borderWidth: 1, borderColor: DS.line, backgroundColor: DS.surfaceHigh,
  },
  sunPillOn: { backgroundColor: DS.lime, borderColor: DS.lime },
  sunPillText: { fontSize: 11, fontWeight: '900', color: DS.textMuted, letterSpacing: 1 },
  sunPillTextOn: { color: DS.bg },

  // Applied to whole blocks while a delivery is in flight. Opacity only — no
  // size or layout change — so nothing shifts under a finger that is already
  // moving toward the next button.
  busyBlock: { opacity: 0.42 },

  gridBtn: {
    flex: 1, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', gap: 2
  },
  // The three run-button treatments, from the shared cricket palette.
  //
  // FOUR was DS.blueDeep — a colour the design system explicitly retired ("blue
  // is gone", ThemeContext) and which nothing else in the app uses for a
  // boundary. So a four was blue here, green on the wagon wheel and green again
  // in the scorecard commentary: three answers to one question.
  //
  // Six carries MORE weight than four rather than a different hue, which is the
  // hierarchy a scorer actually needs — the two events are related, and one is
  // bigger.
  gridBtnDot: { backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.line },
  gridBtnFour: { backgroundColor: CK.four },
  gridBtnSix: { backgroundColor: CK.six, borderWidth: 1, borderColor: CK.six },
  gridBtnWide: { backgroundColor: DS.tintDanger },
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
  syncPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  syncPillSaving: { backgroundColor: DS.surfaceHigh, borderColor: DS.surfaceHighest },
  syncPillOk: { backgroundColor: DS.tintAccent, borderColor: DS.borderAccent },
  syncPillFail: { backgroundColor: DS.tintDanger, borderColor: DS.coral },
  syncPillText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  // Icon-only variant of syncPill, for the two BALL INTELLIGENCE controls.
  //
  // They are persistent status, not news: SYNCED appears for a second after a
  // ball and goes, but these sit in the row all match. Spelling out "BI ON" and
  // "SHOT" beside it cost about 70dp of a ~340dp row, and the thing that gave
  // way was the over's run total — which is cricket, and outranks both. Colour
  // carries the state (lime = capturing, muted = paused) and the accessibility
  // label carries the words.
  pillIcon: {
    width: 26, height: 22, alignItems: 'center', justifyContent: 'center',
    borderRadius: 999, borderWidth: 1,
  },
  freeHitPill: { backgroundColor: DS.limeBright, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'center' },
  freeHitText: { fontSize: 9, fontWeight: '900', color: DS.bg, letterSpacing: 0.8 },
  overBalls: { flexDirection: 'row', gap: 5 },
  overBall: { minWidth: 32, height: 32, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
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
  settingTextNoFlex: { fontSize: 15, fontWeight: '700', color: DS.textPrimary },
  // Armed-but-not-committed row in the end-innings / retire sheets.
  settingRowPicked: { backgroundColor: DS.tintAccent, borderRadius: 10, paddingHorizontal: 10, marginHorizontal: -6 },
  settingRowPickedDanger: { backgroundColor: DS.tintDanger, borderRadius: 10, paddingHorizontal: 10, marginHorizontal: -6 },
  settingHint: { fontSize: 12, fontWeight: '800', color: DS.textMuted, marginRight: 2 },

  // Short Run confirm dialog
  shortRunCalc: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 18 },
  shortRunCalcNum: { fontSize: 34, fontWeight: '900', color: DS.textPrimary, letterSpacing: -1 },
  yesNoRow: { flexDirection: 'row', gap: 10 },
  yesNoBtn: { flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  noBtn: { backgroundColor: DS.surfaceHigh },
  noBtnText: { fontSize: 15, fontWeight: '800', color: DS.textVariant },
  yesBtn: { backgroundColor: DS.coral },
  yesBtnText: { fontSize: 15, fontWeight: '900', color: DS.onBlue },

  // "Add from squad" button (batsman/bowler pickers)
  squadAddBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 8, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: DS.lime, borderStyle: 'dashed',
  },
  squadAddText: { fontSize: 14, fontWeight: '800', color: DS.lime, letterSpacing: 0.3 },

  // ── OVER COMPLETE sheet — the between-overs break ──
  // Taller than the stock 60% sheet: this one carries the over, the bowler, the
  // crease and the match state, and the two buttons sit below the scroll.
  ocSheet: { maxHeight: '88%' },
  ocHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  ocTitle: { fontSize: 17, fontWeight: '900', color: DS.textPrimary, letterSpacing: 1 },
  ocSub: { fontSize: 13, fontWeight: '700', color: DS.textVariant, marginTop: 2 },
  ocSubNum: { fontSize: 15, fontWeight: '900', color: DS.lime },
  ocMaiden: { backgroundColor: DS.lime, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  ocMaidenText: { fontSize: 10, fontWeight: '900', color: DS.bg, letterSpacing: 0.9 },
  ocBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  ocCard: {
    backgroundColor: DS.surfaceHigh, borderRadius: 12, padding: 11,
    gap: 7, marginBottom: 8, borderWidth: 1, borderColor: DS.line,
  },
  ocStateCard: { borderLeftWidth: 3, borderLeftColor: DS.lime },
  ocRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ocRowName: { flex: 1, fontSize: 14, fontWeight: '600', color: DS.textPrimary },
  ocRowNameStrike: { fontWeight: '900' },
  ocRowFig: { fontSize: 13, fontWeight: '800', color: DS.textVariant },
  ocRowFigSub: { fontSize: 11, fontWeight: '700', color: DS.textMuted },
  ocRowFigLit: { color: DS.lime },
  ocRowNote: { fontSize: 10.5, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.7 },
  ocScore: { flex: 1, fontSize: 20, fontWeight: '900', color: DS.textPrimary, letterSpacing: -0.3 },
  ocScoreSub: { fontSize: 13, fontWeight: '700', color: DS.textVariant, letterSpacing: 0 },
  ocChase: { fontSize: 12.5, fontWeight: '700', color: DS.textVariant },
  ocChaseLit: { fontWeight: '900', color: DS.lime },

  // "Continue scoring" — commits the armed pick in the batsman/bowler pickers.
  confirmBtn: {
    backgroundColor: DS.lime, borderRadius: 12, paddingVertical: 14,
    marginTop: 10, alignItems: 'center',
  },
  confirmBtnOff: { backgroundColor: DS.surfaceHighest },
  // Destructive variant — ending an innings/match, or retiring a batter OUT.
  confirmBtnDanger: { backgroundColor: DS.coral },
  confirmBtnText: { fontSize: 15, fontWeight: '900', color: DS.bg, letterSpacing: 0.3 },
  confirmBtnTextOff: { color: DS.textMuted },

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
  dropRunsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 14, justifyContent: 'center' },
  dropRunBtn: {
    width: 62, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: DS.surfaceHigh, borderWidth: 1.5, borderColor: DS.border,
  },
  dropRunText: { fontSize: 20, fontWeight: '900', color: DS.textPrimary },
  directHitRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 12, marginBottom: 10,
    borderRadius: 12, borderWidth: 1, borderColor: DS.border,
  },
  directHitRowOn: { borderColor: DS.lime, backgroundColor: DS.tintAccent },
  directHitLabel: { fontSize: 14, fontWeight: '800', color: DS.textPrimary },
  directHitHint: { fontSize: 11, fontWeight: '600', color: DS.textMuted, marginTop: 2 },

  // Run-out flow: segmented pickers (what was bowled / runs completed / how they
  // were credited) and the secondary line under a choice that spells out its
  // consequence — who ends up on strike.
  fieldLabel: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 1, marginTop: 8, marginBottom: 8 },
  segRow: { flexDirection: 'row', gap: 6 },
  segBtn: { flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 10, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  segWide: { backgroundColor: DS.surfaceHigh, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, alignItems: 'center', marginTop: 6 },
  segBtnOn: { backgroundColor: DS.lime },
  segText: { fontSize: 12, fontWeight: '800', color: DS.textVariant, textAlign: 'center' },
  segTextOn: { color: DS.bg },
  rowHint: { fontSize: 11, fontWeight: '600', color: DS.textMuted, marginTop: 2 },
  playerOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  playerAvatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  playerInitial: { fontSize: 16, fontWeight: '800', color: DS.textPrimary },
  playerOptionPicked: {
    backgroundColor: DS.tintAccent, borderRadius: 10,
    paddingHorizontal: 10, marginHorizontal: -10,
  },
  playerName: { flex: 1, fontSize: 15, fontWeight: '500', color: DS.textPrimary },
  playerNamePicked: { fontWeight: '800', color: DS.lime },
  modalClose: { backgroundColor: DS.surfaceHigh, borderRadius: 12, paddingVertical: 13, marginTop: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 14, fontWeight: '700', color: DS.textMuted }
});
};

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
    backgroundColor: DS.tintAccent, borderRadius: 12, padding: 12, marginBottom: 8
  },
  inningsText: { fontSize: 14, fontWeight: '700', color: DS.lime },

  section: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 14, marginBottom: 4 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 1.5, marginBottom: 12 },
  playerRow: { flexDirection: 'row', gap: 10, paddingRight: 8 },
  playerChip: {
    alignItems: 'center', gap: 6, padding: 10,
    backgroundColor: DS.surfaceLow, borderRadius: 14, minWidth: 72
  },
  playerChipActive: { backgroundColor: DS.tintAccent, borderWidth: 1.5, borderColor: DS.lime },
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