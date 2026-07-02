import { useTheme, useThemedStyles } from "../theme/ThemeContext";import { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Modal, Share, StatusBar, Dimensions } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { haptic } from '../utils/haptics';

const { width } = Dimensions.get('window');
















export default function ScoringScreen({ route, navigation }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);const setup = useThemedStyles(makeSetup);
  const { match } = route.params || {};
  const [matchData] = useState(match || {});

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
  const [matchComplete, setMatchComplete] = useState(false);
  const [matchResult, setMatchResult] = useState('');
  const [currentInningId, setCurrentInningId] = useState('');
  const [ballCount, setBallCount] = useState(0);
  const [overSummary, setOverSummary] = useState(null);
  const [scoringReady, setScoringReady] = useState(false);

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

  const overStr = `${currentScore.overs}.${currentScore.balls}`;
  const totalOvers = parseInt(matchData.overs, 10) || 20;
  const target = isInnings2 ? firstInningsScore.runs + 1 : 0;
  const need = isInnings2 ? Math.max(0, target - currentScore.runs) : 0;
  const ballsLeft = isInnings2 ? Math.max(1, totalOvers * 6 - (currentScore.overs * 6 + currentScore.balls)) : 1;

  const persistBall = async (runs, extras, extraType, isWicket, wicketType) => {
    if (!currentInningId || !striker || !nonStriker || !currentBowler) return;
    const overNumber = currentScore.overs + 1;
    const newBallCount = ballCount + 1;
    setBallCount(newBallCount);
    await legendsApi.updateScore(matchData.id, {
      inningId: currentInningId, overNumber, ballNumber: newBallCount,
      bowlerId: currentBowler.id, batterId: striker.id, nonStrikerId: nonStriker.id,
      runs, extras, extraType: extraType || null,
      isWicket, wicketType: wicketType || null,
      dismissedPlayerId: isWicket ? striker.id : null
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

  const handleScore = async (value) => {
    if (matchComplete) return;
    // Tactile feedback: a firm buzz on a wicket, a light tick on every other ball.
    if (value === 'out') haptic.warn(); else haptic.tick();
    let newScore = { ...currentScore };
    let newOver = [...currentOver];

    if (typeof value === 'number') {
      newScore.runs += value;
      newScore.balls += 1;
      newOver.push(value === 0 ? '·' : String(value));
      await persistBall(value, 0, null, false, null);
      if (value % 2 === 1) {const t = striker;setStriker(nonStriker);setNonStriker(t);}
    } else if (value === 'wide') {
      newScore.runs += 1;
      newOver.push('WD');
      await persistBall(0, 1, 'wide', false, null);
    } else if (value === 'noball') {
      newScore.runs += 1;
      newOver.push('NB');
      await persistBall(0, 1, 'noBall', false, null);
    } else if (value === 'bye') {
      newScore.runs += 1;
      newScore.balls += 1;
      newOver.push('B');
      await persistBall(0, 1, 'bye', false, null);
    } else if (value === 'legbye') {
      newScore.runs += 1;
      newScore.balls += 1;
      newOver.push('LB');
      await persistBall(0, 1, 'legBye', false, null);
    } else if (value === 'out') {
      newScore.wickets += 1;
      newScore.balls += 1;
      newOver.push('W');
      await persistBall(0, 0, null, true, 'bowled');
      if (newScore.wickets < 10) setShowPlayerModal(true);
    }

    if (newScore.balls >= 6) {
      // Build over summary before reset
      const overRuns = newOver.reduce((acc, b) => {
        if (b === 'WD' || b === 'NB' || b === 'B' || b === 'LB') return acc + 1;
        if (b === '·') return acc;
        if (!isNaN(parseInt(b))) return acc + parseInt(b);
        return acc;
      }, 0);
      const overWickets = newOver.filter((b) => b === 'W').length;
      const overExtras = newOver.filter((b) => ['WD', 'NB', 'B', 'LB'].includes(b)).length;
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
      const t = striker;setStriker(nonStriker);setNonStriker(t);
      if (newScore.overs < totalOvers && newScore.wickets < 10) setShowBowlerModal(true);
    } else {
      setCurrentOver(newOver);
    }

    setCurrentScore(newScore);
    const scoreStr = `${newScore.runs}/${newScore.wickets} (${newScore.overs}.${newScore.balls})`;
    if (!isInnings2) legendsApi.updateMatch(matchData.id, { score1: scoreStr });
    if (isInnings2) checkWinCondition(newScore);
    if (!isInnings2 && (newScore.wickets >= 10 || newScore.overs >= totalOvers && newScore.balls === 0)) endInnings();
  };

  const endInnings = () => {
    if (!isInnings2) {
      const saved = { ...currentScore };
      setFirstInningsScore(saved);
      Alert.alert(
        'End Innings',
        `${battingTeamName}: ${saved.runs}/${saved.wickets} (${saved.overs}.${saved.balls})\nStart second innings?`,
        [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes', onPress: async () => {
            const s1 = `${saved.runs}/${saved.wickets} (${saved.overs}.${saved.balls})`;
            await legendsApi.updateMatch(matchData.id, { score1: s1 });
            const inn = await legendsApi.createInning(matchData.id, {
              battingTeamId: bowlingTeamId, bowlingTeamId: battingTeamId, targetScore: saved.runs + 1
            });
            setIsInnings2(true);
            setCurrentInningId(inn.success ? inn.data.id : '');
            setCurrentScore({ runs: 0, wickets: 0, overs: 0, balls: 0 });
            setCurrentOver([]);setBallCount(0);setOverSummary(null);
            setBattingTeamName(bowlingTeamName);setBowlingTeamName(battingTeamName);
            setBattingXI(bowlingXI);setBowlingXI(battingXI);
            setBattingTeamId(bowlingTeamId);setBowlingTeamId(battingTeamId);
            // Reset players — user picks on setup screen for 2nd innings too
            setStriker(null);setNonStriker(null);setCurrentBowler(null);
            setScoringReady(false);
          } }]

      );
    } else {
      const diff = target - 1 - currentScore.runs;
      endMatch(diff === 0 ? 'Match Tied!' : `${bowlingTeamName} won by ${diff} run${diff !== 1 ? 's' : ''}`, currentScore);
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

  const bowlerStats = currentBowler ?
  `${currentScore.overs}.${currentScore.balls} - 0 - ${currentScore.runs} - ${currentScore.wickets}` :
  '—';

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
          <TouchableOpacity style={styles.topBarBtn} onPress={() => Alert.alert('Settings', 'Match settings')}>
            <Icon name="cog-outline" size={20} color={DS.textVariant} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

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
                {striker ? `${(striker.stats?.runs || 0) % 100}(${(striker.stats?.balls || 0) % 50}) • 4x4, 2x6` : '—'}
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
            <TouchableOpacity onPress={() => setShowBowlerModal(true)} style={styles.bowlerSwap}>
              <Icon name="swap-horizontal" size={16} color={DS.textMuted} />
            </TouchableOpacity>
            <Text style={styles.bowlerName} numberOfLines={1}>{currentBowler?.name || 'Select'}</Text>
            <Text style={styles.bowlerStats}>{bowlerStats}</Text>
          </View>
        </View>

        {/* ── EXTRA ACTIONS ── */}
        {!matchComplete &&
        <View style={styles.extraRow}>
            <TouchableOpacity style={styles.extraBtn} onPress={() => Alert.alert('Undo', 'Undo is not yet supported')}>
              <Icon name="undo" size={14} color={DS.textMuted} />
              <Text style={styles.extraBtnText}>UNDO</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extraBtn} onPress={() => Alert.alert('Redo', 'Redo not supported')}>
              <Icon name="redo" size={14} color={DS.textMuted} />
              <Text style={styles.extraBtnText}>REDO</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extraBtn} onPress={() => handleScore('bye')}>
              <Text style={styles.extraBtnText}>BYE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extraBtn} onPress={() => handleScore('legbye')}>
              <Text style={styles.extraBtnText}>LEG{'\n'}BYE</Text>
            </TouchableOpacity>
          </View>
        }

        {/* ── SCORING GRID 3×3 ── */}
        {!matchComplete &&
        <View style={styles.grid}>
            {/* Row 1 */}
            <View style={styles.gridRow}>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnDot]} onPress={() => handleScore(0)}>
                <Text style={styles.gridBtnNum}>0</Text>
                <Text style={styles.gridBtnLabel}>DOT</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnDot]} onPress={() => handleScore(1)}>
                <Text style={styles.gridBtnNum}>1</Text>
                <Text style={styles.gridBtnLabel}>SINGLE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnDot]} onPress={() => handleScore(2)}>
                <Text style={styles.gridBtnNum}>2</Text>
                <Text style={styles.gridBtnLabel}>DOUBLE</Text>
              </TouchableOpacity>
            </View>
            {/* Row 2 */}
            <View style={styles.gridRow}>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnDot]} onPress={() => handleScore(3)}>
                <Text style={styles.gridBtnNum}>3</Text>
                <Text style={styles.gridBtnLabel}>TRIPLE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnFour]} onPress={() => handleScore(4)}>
                <Text style={[styles.gridBtnNum, { color: '#fff' }]}>4</Text>
                <Text style={[styles.gridBtnLabel, { color: 'rgba(255,255,255,0.7)' }]}>BOUNDARY</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnSix]} onPress={() => handleScore(6)}>
                <Text style={[styles.gridBtnNum, { color: DS.lime }]}>6</Text>
                <Text style={[styles.gridBtnLabel, { color: DS.lime }]}>MAXIMUM</Text>
              </TouchableOpacity>
            </View>
            {/* Row 3 */}
            <View style={styles.gridRow}>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnWide]} onPress={() => handleScore('wide')}>
                <Text style={[styles.gridBtnNum, styles.gridBtnWideText]}>WD</Text>
                <Text style={[styles.gridBtnLabel, styles.gridBtnWideText]}>WIDE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnWide]} onPress={() => handleScore('noball')}>
                <Text style={[styles.gridBtnNum, styles.gridBtnWideText]}>NB</Text>
                <Text style={[styles.gridBtnLabel, styles.gridBtnWideText]}>NO BALL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, styles.gridBtnWicket]} onPress={() => handleScore('out')}>
                <Icon name="close" size={28} color={DS.wicketText} />
                <Text style={[styles.gridBtnLabel, { color: DS.wicketText }]}>WICKET</Text>
              </TouchableOpacity>
            </View>
          </View>
        }

        {/* ── CURRENT OVER TRACKER ── */}
        <View style={styles.overSection}>
          <Text style={styles.overSectionLabel}>CURRENT{'\n'}OVER</Text>
          <View style={styles.overBalls}>
            {filledOver.map((b, i) =>
            b !== null ?
            renderBallDot(b, i) :
            <View key={i} style={[styles.overBall, styles.overBallEmpty]}>
                    <View style={styles.overBallDot} />
                  </View>
            )}
          </View>
        </View>

        {/* ── MOMENTUM BAR ── */}
        <View style={styles.momentumSection}>
          <View style={styles.momentumBar}>
            <View style={[styles.momentumFill, { width: `${Math.min(100, currentScore.runs / Math.max(1, totalOvers * 7) * 100)}%` }]} />
          </View>
          <View style={styles.momentumLabels}>
            <Text style={styles.momentumLabelLeft}>BATTING POWER</Text>
            <Text style={styles.momentumLabelRight}>BOWLING PRESSURE</Text>
          </View>
        </View>

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
            <TouchableOpacity style={styles.completeOverBtn} onPress={() => {setOverSummary(null);setShowBowlerModal(true);}}>
              <Icon name="check-circle" size={28} color={DS.bg} />
              <Text style={styles.completeOverText}>COMPLETE{'\n'}OVER</Text>
            </TouchableOpacity>
          </View>
        }

        {/* ── END INNINGS / MATCH ── */}
        {!matchComplete &&
        <TouchableOpacity style={styles.endBtn} onPress={endInnings}>
            <Text style={styles.endBtnText}>{isInnings2 ? 'END MATCH' : 'END INNINGS'}</Text>
          </TouchableOpacity>
        }

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

        <View style={{ height: 32 }} />
      </ScrollView>

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
      <Modal visible={showBowlerModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Change Bowler</Text>
            <ScrollView>
              {bowlingXI.map((p, i) =>
              <TouchableOpacity key={i} style={styles.playerOption}
              onPress={() => {setCurrentBowler(p);setShowBowlerModal(false);}}>
                  <View style={[styles.playerAvatar, { backgroundColor: DS.lime + '33' }]}>
                    <Text style={[styles.playerInitial, { color: DS.lime }]}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.playerName}>{p.name}</Text>
                  <Icon name="chevron-right" size={18} color={DS.textMuted} />
                </TouchableOpacity>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowBowlerModal(false)}>
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
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 48, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: DS.bg
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
    backgroundColor: DS.surfaceHigh, marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 10
  },
  scoreLeft: { flex: 1 },
  scoreLabel: { fontSize: 11, fontWeight: '700', color: DS.lime, letterSpacing: 1.5, marginBottom: 4 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end' },
  scoreMain: { fontSize: 48, fontWeight: '900', color: DS.textPrimary, letterSpacing: -2, lineHeight: 54 },
  scoreOvers: { fontSize: 18, color: DS.textMuted, fontWeight: '600', marginBottom: 6 },
  scoreRight: { alignItems: 'flex-end' },
  targetLabel: { fontSize: 11, fontWeight: '700', color: DS.coral, letterSpacing: 1 },
  targetVal: { fontSize: 28, fontWeight: '900', color: DS.coral },
  needText: { fontSize: 13, color: DS.coral, textAlign: 'right', lineHeight: 18, marginTop: 2 },
  resultPill: { marginTop: 8, backgroundColor: DS.lime, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3, alignSelf: 'flex-start' },
  resultText: { fontSize: 12, fontWeight: '700', color: DS.bg },

  // Players row
  playersRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 10 },
  strikerCard: {
    flex: 1.1, backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 12,
    borderLeftWidth: 3, borderLeftColor: DS.lime
  },
  bowlerCard: {
    flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 12,
    borderLeftWidth: 3, borderLeftColor: DS.surfaceHighest
  },
  playerCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  strikerLabel: { fontSize: 10, fontWeight: '700', color: DS.lime, letterSpacing: 1.2 },
  strikerName: { fontSize: 17, fontWeight: '900', color: DS.textPrimary, lineHeight: 22, marginBottom: 6 },
  strikerBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  strikerStats: { fontSize: 11, color: DS.textMuted, flex: 1 },
  searchBtn: { padding: 4 },
  bowlerIconCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  bowlerLabel: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 1.2 },
  bowlerSwap: { alignSelf: 'flex-start', marginBottom: 4 },
  bowlerName: { fontSize: 16, fontWeight: '800', color: DS.textPrimary, marginBottom: 4 },
  bowlerStats: { fontSize: 11, color: DS.textMuted },

  // Extra action row
  extraRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 10 },
  extraBtn: {
    flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center', gap: 2
  },
  extraBtnText: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.5, textAlign: 'center' },

  // 3×3 Grid
  grid: { marginHorizontal: 16, gap: 8, marginBottom: 10 },
  gridRow: { flexDirection: 'row', gap: 8 },
  gridBtn: {
    flex: 1, height: GRID_BTN * 0.9, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', gap: 4
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
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 8
  },
  overSectionLabel: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.8, lineHeight: 14 },
  overBalls: { flex: 1, flexDirection: 'row', gap: 6 },
  overBall: { flex: 1, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
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

  // End innings / match
  endBtn: {
    marginHorizontal: 16, backgroundColor: DS.surfaceHigh, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginBottom: 10
  },
  endBtnText: { fontSize: 13, fontWeight: '700', color: DS.textMuted, letterSpacing: 1 },

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
  modalTitle: { fontSize: 18, fontWeight: '800', color: DS.textPrimary, marginBottom: 16, textAlign: 'center' },
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