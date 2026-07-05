import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share, Image } from
'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { captureRef } from 'react-native-view-shot';
import RNShare from 'react-native-share';
import legendsApi from '../services/LegendsApi';

// Cricket dismissal notation: "b Bowler", "c Fielder b Bowler", "c & b Bowler",
// "lbw b Bowler", "st Keeper b Bowler", "run out (Fielder)", "hit wicket b Bowler".
function formatDismissal(wicketType, catcher, bowler) {
  const t = String(wicketType || '').toLowerCase().replace(/[\s&]/g, '');
  const b = bowler || '';
  switch (t) {
    case 'bowled': return `b ${b}`;
    case 'lbw': return `lbw b ${b}`;
    case 'caught':
      if (catcher && bowler && catcher === bowler) return `c & b ${b}`;
      return `c ${catcher || 'fielder'} b ${b}`;
    case 'caughtbowled': case 'candb': return `c & b ${b}`;
    case 'stumped': return `st ${catcher || 'keeper'} b ${b}`;
    case 'runout': return `run out${catcher ? ` (${catcher})` : ''}`;
    case 'hitwicket': return `hit wicket b ${b}`;
    case 'retiredout': return 'retired out';
    case 'retiredhurt': return 'retired hurt';
    default: return wicketType || 'out';
  }
}

// Full batting card built from the batting XI (in order) so EVERY batter shows —
// including run-out non-strikers who never faced a ball, and yet-to-bat players.
function computeBatting(innings, battingXI) {
  const fig = {};   // playerId -> figures (runs/balls off the bat)
  const dis = {};   // dismissedPlayerId -> howOut (covers non-facing run-outs too)
  const nameFromBall = {};
  (innings.oversData || []).forEach((over) => {
    (over.balls || []).forEach((ball) => {
      const id = ball.batterId;
      if (id) {
        if (ball.batter?.name) nameFromBall[id] = ball.batter.name;
        if (!fig[id]) fig[id] = { runs: 0, balls: 0, fours: 0, sixes: 0 };
        const et = ball.extraType;
        if (et !== 'wide' && et !== 'penalty' && et !== 'retired') fig[id].balls += 1;   // faced
        if (!et || et === 'noBall') {                                        // runs off the bat
          fig[id].runs += ball.runs;
          if (ball.runs === 4) fig[id].fours += 1;
          if (ball.runs === 6) fig[id].sixes += 1;
        }
      }
      if (ball.isWicket && ball.dismissedPlayerId) {
        dis[ball.dismissedPlayerId] = formatDismissal(ball.wicketType, ball.wicketAssists, over.bowler?.name);
      }
    });
  });
  // Prefer the actual XI order; fall back to whoever appears in the ball log.
  const xi = (battingXI && battingXI.length)
    ? battingXI
    : [...new Set([...Object.keys(fig), ...Object.keys(dis)])].map((id) => ({ id, name: nameFromBall[id] || 'Unknown' }));
  const batted = [];
  const yetToBat = [];
  xi.forEach((p) => {
    const f = fig[p.id];
    const out = dis[p.id];
    if (f || out) {
      batted.push({
        id: p.id, name: p.name, runs: f?.runs || 0, balls: f?.balls || 0,
        fours: f?.fours || 0, sixes: f?.sixes || 0, out: !!out, howOut: out || '',
      });
    } else {
      yetToBat.push(p.name);
    }
  });
  return { batted, yetToBat };
}

// Bowling card from the ball log: overs from legal balls, runs actually charged to
// the bowler (byes/leg-byes excluded), wickets (run-outs not credited), maidens.
function computeBowling(innings) {
  const map = {};
  const order = [];
  (innings.oversData || []).forEach((over) => {
    const id = over.bowlerId;
    if (!map[id]) { map[id] = { id, name: over.bowler?.name || 'Unknown', legalBalls: 0, runs: 0, wickets: 0, maidens: 0 }; order.push(id); }
    let overRuns = 0, overLegal = 0;
    (over.balls || []).forEach((b) => {
      const et = b.extraType;
      let charged = 0, legal = false;
      if (et === 'wide') charged = b.extras;
      else if (et === 'noBall') charged = b.runs + b.extras;
      else if (et === 'bye' || et === 'legBye') legal = true;      // not charged
      else if (et === 'penalty' || et === 'retired') charged = 0;  // not a delivery
      else { charged = b.runs; legal = true; }
      map[id].runs += charged; overRuns += charged;
      if (legal) { map[id].legalBalls += 1; overLegal += 1; }
      if (b.isWicket) {
        const wt = String(b.wicketType || '').toLowerCase().replace(/\s/g, '');
        if (wt !== 'runout' && wt !== 'retired') map[id].wickets += 1;
      }
    });
    if (overLegal >= 6 && overRuns === 0) map[id].maidens += 1;
  });
  return order.map((id) => {
    const b = map[id];
    const oversFloat = b.legalBalls / 6;
    return { ...b, overs: `${Math.floor(b.legalBalls / 6)}.${b.legalBalls % 6}`, economy: oversFloat > 0 ? (b.runs / oversFloat).toFixed(1) : '0.0' };
  });
}

// Total overs bowled in the innings (from legal balls) → "X.Y".
function inningsOvers(innings) {
  let legal = 0;
  (innings.oversData || []).forEach((over) => (over.balls || []).forEach((b) => {
    if (!['wide', 'noBall', 'penalty', 'retired'].includes(b.extraType)) legal += 1;
  }));
  return `${Math.floor(legal / 6)}.${legal % 6}`;
}

// Extras breakdown: byes / leg-byes / wides / no-balls / penalty + total.
function computeExtras(innings) {
  const e = { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0, total: 0 };
  (innings.oversData || []).forEach((over) => (over.balls || []).forEach((b) => {
    if (b.extraType === 'bye') e.byes += b.extras;
    else if (b.extraType === 'legBye') e.legByes += b.extras;
    else if (b.extraType === 'wide') e.wides += b.extras;
    else if (b.extraType === 'noBall') e.noBalls += b.extras;
    else if (b.extraType === 'penalty') e.penalty += b.extras;
    e.total += (['bye', 'legBye', 'wide', 'noBall', 'penalty'].includes(b.extraType) ? b.extras : 0);
  }));
  return e;
}

// Fall of Wickets: "score-wicket (Batter, over.ball)" in the order they fell.
function computeFOW(innings, nameById) {
  const fow = [];
  let running = 0, wkts = 0, legal = 0;
  (innings.oversData || []).forEach((over) => (over.balls || []).forEach((b) => {
    running += b.runs + b.extras;
    if (!['wide', 'noBall', 'penalty', 'retired'].includes(b.extraType)) legal += 1;
    if (b.isWicket) {
      wkts += 1;
      fow.push({ wkt: wkts, score: running, name: nameById[b.dismissedPlayerId] || 'batter', over: `${Math.floor(legal / 6)}.${legal % 6}` });
    }
  }));
  return fow;
}

// Short label for a ball in the over-by-over timeline.
function ballLabel(b) {
  if (b.extraType === 'wide') return `${b.extras > 1 ? b.extras : ''}wd`;
  if (b.extraType === 'noBall') return `${b.runs > 0 ? b.runs : ''}nb`;
  if (b.extraType === 'bye') return `${b.extras}b`;
  if (b.extraType === 'legBye') return `${b.extras}lb`;
  if (b.extraType === 'penalty') return 'P5';
  if (b.extraType === 'retired') return 'R';
  if (b.isWicket) return 'W';
  return b.runs === 0 ? '•' : `${b.runs}`;
}

// One text commentary line for a single ball — plain, factual, Cricbuzz-style
// ("Bowler to Batter, N runs"), built entirely from data we already have.
function ballCommentary(ball, bowlerName) {
  const batter = ball.batter?.name || 'Batter';
  const et = ball.extraType;
  if (et === 'wide') return `${bowlerName} to ${batter}, wide`;
  if (et === 'noBall') return `${bowlerName} to ${batter}, no ball${ball.runs ? `, ${ball.runs} run${ball.runs > 1 ? 's' : ''}` : ''}`;
  if (et === 'bye') return `${bowlerName} to ${batter}, ${ball.extras} bye${ball.extras > 1 ? 's' : ''}`;
  if (et === 'legBye') return `${bowlerName} to ${batter}, ${ball.extras} leg bye${ball.extras > 1 ? 's' : ''}`;
  if (et === 'penalty') return 'Penalty awarded, 5 runs';
  if (et === 'retired') return `${batter} retires ${String(ball.wicketType).toLowerCase() === 'retiredhurt' ? 'hurt' : 'out'}`;
  if (ball.isWicket) return `${bowlerName} to ${batter}, OUT! ${formatDismissal(ball.wicketType, ball.wicketAssists, bowlerName)}`;
  if (ball.runs === 0) return `${bowlerName} to ${batter}, no run`;
  if (ball.runs === 4) return `${bowlerName} to ${batter}, FOUR!`;
  if (ball.runs === 6) return `${bowlerName} to ${batter}, SIX!`;
  return `${bowlerName} to ${batter}, ${ball.runs} run${ball.runs > 1 ? 's' : ''}`;
}

// Ball-by-ball commentary for a whole innings, newest ball first.
function buildCommentary(innings) {
  const lines = [];
  (innings.oversData || []).forEach((over) => {
    const bowlerName = over.bowler?.name || 'Bowler';
    let legalInOver = 0;
    (over.balls || []).forEach((ball, idx) => {
      const isLegal = !['wide', 'noBall', 'penalty', 'retired'].includes(ball.extraType);
      if (isLegal) legalInOver += 1;
      lines.push({
        key: `${over.id}-${idx}`,
        label: `${over.overNumber - 1}.${legalInOver}`,
        text: ballCommentary(ball, bowlerName),
        isWicket: !!ball.isWicket,
        isBoundary: !ball.extraType && (ball.runs === 4 || ball.runs === 6),
      });
    });
  });
  return lines.reverse();
}

function TableHeader({ cols }) {const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.tableHeader}>
      {cols.map((c, i) =>
      <Text key={i} style={[styles.cell, i === 0 ? styles.nameCol : styles.numCol, styles.headerCell]}>{c}</Text>
      )}
    </View>);

}

// ── SCORECARD tab: batting + bowling tables, extras, fall of wickets ──────────
function InningsScorecard({ innings, index, squads }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const battingXI = (squads || [])
    .filter((s) => s.teamId === innings.battingTeamId)
    .map((s) => ({ id: s.playerId, name: s.player?.name || 'Unknown' }));
  const nameById = Object.fromEntries((squads || []).map((s) => [s.playerId, s.player?.name || 'batter']));
  const { batted, yetToBat } = computeBatting(innings, battingXI);
  const bowlers = computeBowling(innings);
  const extras = computeExtras(innings);
  const fow = computeFOW(innings, nameById);
  const label = index === 0 ? '1st' : '2nd';

  return (
    <View style={styles.inningsCard}>
      {/* Batting section */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.inningsIndicator} />
          <Text style={styles.sectionHeaderText}>
            {(innings.battingTeam?.name || 'TEAM').toUpperCase()} BATTING
          </Text>
        </View>
        <Text style={styles.inningsLabel}>{label} Innings</Text>
      </View>

      <View style={styles.inningsScoreBanner}>
        <Text style={styles.inningsScore}>{innings.totalRuns}/{innings.totalWickets}</Text>
        <Text style={styles.inningsOvers}>({inningsOvers(innings)} ov)</Text>
      </View>

      <TableHeader cols={['BATTER', 'R', 'B', '4s', '6s', 'SR']} />
      {batted.map((b, i) =>
      <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
          <View style={[styles.cell, styles.nameCol]}>
            <Text style={styles.batterName}>{b.name}</Text>
            <Text style={b.out ? styles.howOut : styles.notOut}>{b.out ? b.howOut : 'not out'}</Text>
          </View>
          <Text style={[styles.cell, styles.numCol, b.runs >= 50 && styles.highlight]}>{b.runs}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.balls}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.fours}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.sixes}</Text>
          <Text style={[styles.cell, styles.numCol]}>
            {b.balls > 0 ? (b.runs / b.balls * 100).toFixed(0) : '0'}
          </Text>
        </View>
      )}
      {/* Extras + Total */}
      <View style={styles.extrasRow}>
        <Text style={styles.extrasLabel}>Extras</Text>
        <Text style={styles.extrasDetail}>
          (b {extras.byes}, lb {extras.legByes}, w {extras.wides}, nb {extras.noBalls}{extras.penalty ? `, p ${extras.penalty}` : ''})
        </Text>
        <Text style={styles.extrasVal}>{extras.total}</Text>
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL</Text>
        <Text style={styles.totalDetail}>({inningsOvers(innings)} ov)</Text>
        <Text style={styles.totalVal}>{innings.totalRuns}/{innings.totalWickets}</Text>
      </View>

      {yetToBat.length > 0 &&
        <View style={styles.yetToBatRow}>
          <Text style={styles.yetToBatLabel}>Yet to bat: </Text>
          <Text style={styles.yetToBatNames}>{yetToBat.join(', ')}</Text>
        </View>
      }

      {fow.length > 0 &&
        <View style={styles.fowBox}>
          <Text style={styles.fowTitle}>FALL OF WICKETS</Text>
          <Text style={styles.fowText}>
            {fow.map((f) => `${f.score}-${f.wkt} (${f.name}, ${f.over})`).join('   ')}
          </Text>
        </View>
      }

      {/* Bowling section */}
      <View style={[styles.sectionHeaderRow, { marginTop: 18 }]}>
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.inningsIndicator, { backgroundColor: DS.coral }]} />
          <Text style={styles.sectionHeaderText}>
            {(innings.bowlingTeam?.name || 'TEAM').toUpperCase()} BOWLING
          </Text>
        </View>
      </View>

      <TableHeader cols={['BOWLER', 'O', 'M', 'R', 'W', 'ECON']} />
      {bowlers.map((b, i) =>
      <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
          <Text style={[styles.cell, styles.nameCol, styles.bowlerName]}>{b.name}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.overs}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.maidens}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.runs}</Text>
          <Text style={[styles.cell, styles.numCol, b.wickets >= 3 && styles.highlight]}>{b.wickets}</Text>
          <Text style={[styles.cell, styles.numCol]}>{b.economy}</Text>
        </View>
      )}
    </View>);

}

// ── OVERS tab: every over as a row of colour-coded ball chips ─────────────────
function InningsOvers({ innings }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const overs = [...(innings.oversData || [])].sort((a, b) => a.overNumber - b.overNumber);
  if (!overs.length) {
    return <Text style={styles.emptyTabText}>No overs bowled yet.</Text>;
  }
  return (
    <View style={styles.inningsCard}>
      {overs.map((ov) => (
        <View key={ov.id} style={styles.overLine}>
          <Text style={styles.overLineNum}>Ov {ov.overNumber}</Text>
          <View style={styles.overLineBalls}>
            {(ov.balls || []).map((b, i) => {
              const lbl = ballLabel(b);
              const isW = b.isWicket, isBoundary = !b.extraType && (b.runs === 4 || b.runs === 6), isExtra = ['wide', 'noBall', 'bye', 'legBye', 'penalty'].includes(b.extraType);
              return (
                <View key={i} style={[styles.ballChip, isW && styles.ballChipW, isBoundary && styles.ballChipBoundary, isExtra && styles.ballChipExtra]}>
                  <Text style={[styles.ballChipText, isW && { color: '#fff' }, isBoundary && { color: DS.bg }]}>{lbl}</Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.overLineRuns}>{ov.runs + ov.extras}</Text>
        </View>
      ))}
    </View>
  );
}

// ── LIVE tab: current-over box + reverse-chronological ball commentary ───────
function LiveTab({ innings, squads, onViewAllOvers }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [expanded, setExpanded] = useState(false);
  if (!innings) return <Text style={styles.emptyTabText}>Play hasn't started yet.</Text>;

  const battingXI = (squads || [])
    .filter((s) => s.teamId === innings.battingTeamId)
    .map((s) => ({ id: s.playerId, name: s.player?.name || 'Unknown' }));
  const { batted } = computeBatting(innings, battingXI);
  const bowlers = computeBowling(innings);
  const overs = [...(innings.oversData || [])].sort((a, b) => a.overNumber - b.overNumber);
  const lastOver = overs[overs.length - 1];
  const notOut = batted.filter((b) => !b.out).slice(-2);
  const currentBowler = lastOver ? bowlers.find((b) => b.id === lastOver.bowlerId) : null;
  const commentary = buildCommentary(innings);
  const lastOverRuns = lastOver ? lastOver.runs + lastOver.extras : 0;

  return (
    <View style={{ gap: 12 }}>
      {lastOver &&
        <View style={styles.liveBox}>
          <View style={styles.liveBoxHead}>
            <Text style={styles.liveBoxOver}>Over {lastOver.overNumber}</Text>
            <Text style={styles.liveBoxScore}>{innings.totalRuns}-{innings.totalWickets}</Text>
          </View>
          <View style={styles.liveBallRow}>
            {lastOver.balls.map((b, i) => {
              const lbl = ballLabel(b);
              const isW = b.isWicket, isBoundary = !b.extraType && (b.runs === 4 || b.runs === 6);
              return (
                <View key={i} style={[styles.ballChip, isW && styles.ballChipW, isBoundary && styles.ballChipBoundary]}>
                  <Text style={[styles.ballChipText, isW && { color: '#fff' }, isBoundary && { color: DS.bg }]}>{lbl}</Text>
                </View>
              );
            })}
            <Text style={styles.liveOverRuns}>({lastOverRuns} run{lastOverRuns !== 1 ? 's' : ''})</Text>
          </View>
          <View style={styles.liveFigRow}>
            <View style={{ flex: 1 }}>
              {notOut.map((b) => (
                <Text key={b.id} style={styles.liveFigText} numberOfLines={1}>{b.name}  <Text style={styles.liveFigNum}>{b.runs}({b.balls})</Text></Text>
              ))}
            </View>
            {currentBowler &&
              <Text style={styles.liveFigText} numberOfLines={1}>{currentBowler.name}  <Text style={styles.liveFigNum}>{currentBowler.wickets}-{currentBowler.runs} ({currentBowler.overs})</Text></Text>
            }
          </View>
          <View style={styles.liveBoxLinks}>
            <TouchableOpacity onPress={() => setExpanded((x) => !x)}>
              <Text style={styles.liveLinkText}>Over Summary {expanded ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onViewAllOvers}>
              <Text style={styles.liveLinkText}>View all overs ›</Text>
            </TouchableOpacity>
          </View>
          {expanded &&
            <Text style={styles.liveSummaryText}>
              {currentBowler?.name || 'Bowler'} conceded {lastOverRuns} run{lastOverRuns !== 1 ? 's' : ''} in over {lastOver.overNumber}.
            </Text>
          }
        </View>
      }

      <View style={styles.commentaryBox}>
        {commentary.slice(0, 40).map((line) => (
          <View key={line.key} style={styles.commentaryRow}>
            <Text style={[styles.commentaryLabel, line.isWicket && { color: DS.live }]}>{line.label}</Text>
            <Text style={[styles.commentaryText, line.isWicket && { fontWeight: '800', color: DS.textPrimary }, line.isBoundary && { color: DS.lime, fontWeight: '700' }]}>
              {line.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── SQUADS tab: playing XI (avatar + name + role) per team, plus bench ───────
function PlayerRow({ name, role, avatarUrl }) {const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.squadRow}>
      {avatarUrl
        ? <Image source={{ uri: avatarUrl }} style={styles.squadAvatarImg} />
        : <View style={styles.squadAvatar}><Text style={styles.squadAvatarText}>{(name || '?').charAt(0).toUpperCase()}</Text></View>}
      <View style={{ flex: 1 }}>
        <Text style={styles.squadName} numberOfLines={1}>{name}</Text>
        {!!role && <Text style={styles.squadRole}>{role}</Text>}
      </View>
    </View>
  );
}

function SquadsTab({ match }) {const styles = useThemedStyles(makeStyles);
  const teams = [match.team1, match.team2];
  return (
    <View style={styles.squadsGrid}>
      {teams.map((team, ti) => {
        const squad = (match.squads || []).filter((s) => s.teamId === team?.id);
        const squadIds = new Set(squad.map((s) => s.playerId));
        const bench = (team?.players || []).filter((p) => !squadIds.has(p.id));
        return (
          <View key={team?.id || ti} style={styles.squadCol}>
            <Text style={styles.squadTeamName} numberOfLines={1}>{team?.name || `Team ${ti + 1}`}</Text>
            <Text style={styles.squadSectionLabel}>PLAYING XI</Text>
            {squad.map((s) => (
              <PlayerRow key={s.playerId} name={s.player?.name} role={s.player?.role} avatarUrl={s.player?.user?.avatarUrl} />
            ))}
            {squad.length === 0 && <Text style={styles.emptyTabText}>Not announced yet.</Text>}
            {bench.length > 0 &&
              <>
                <Text style={[styles.squadSectionLabel, { marginTop: 10 }]}>BENCH</Text>
                {bench.map((p) => (
                  <PlayerRow key={p.id} name={p.name} role={p.role} avatarUrl={null} />
                ))}
              </>
            }
          </View>
        );
      })}
    </View>
  );
}

// ── INFO tab: the match facts we actually track (no fabricated umpires/TV data) ─
function InfoRow({ label, value }) {const styles = useThemedStyles(makeStyles);
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function InfoTab({ match }) {const styles = useThemedStyles(makeStyles);
  const tossTeamName = match.tossWinnerId === match.team1?.id ? match.team1?.name
    : match.tossWinnerId === match.team2?.id ? match.team2?.name : null;
  const toss = tossTeamName ? `${tossTeamName} opt to ${match.tossDecision === 'bowl' ? 'bowl' : 'bat'}` : null;
  const when = match.startTime || match.createdAt;
  return (
    <View style={styles.inningsCard}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.inningsIndicator} />
          <Text style={styles.sectionHeaderText}>MATCH INFO</Text>
        </View>
      </View>
      <View style={{ padding: 4 }}>
        <InfoRow label="Format" value={match.matchType} />
        <InfoRow label="Overs" value={match.overs ? `${match.overs} per side` : null} />
        <InfoRow label="Ball" value={match.ballType} />
        <InfoRow label="Venue" value={match.venue} />
        <InfoRow label="Toss" value={toss} />
        <InfoRow label="Date" value={when ? new Date(when).toLocaleString() : null} />
        <InfoRow label="Status" value={match.status ? match.status.charAt(0).toUpperCase() + match.status.slice(1) : null} />
      </View>
    </View>
  );
}

export default function ScorecardScreen({ route, navigation }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const { matchId } = route.params || {};
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inningsTab, setInningsTab] = useState(0);   // which innings/team scorecard to show
  const [tab, setTab] = useState(null);              // active top tab; null until match first loads
  const shotRef = useRef(null);                      // capture target for "share as image"

  useLayoutEffect(() => {
    // Hide the stack header — the branded bar below is the single header, giving the
    // scorecard the full screen (no duplicate "Scorecard" bar eating vertical space).
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const loadScorecard = useCallback((showSpinner = false) => {
    if (showSpinner) setLoading(true);
    return legendsApi.getScorecard(matchId)
      .then((res) => { if (res.success) setMatch(res.data); })
      .finally(() => setLoading(false));
  }, [matchId]);

  // Watch a live match like Cricbuzz/Cricinfo: auto-refresh every few seconds while
  // this screen is focused, so the score/overs/wickets update without a manual pull.
  // Anyone can land here — team members and followers included — this is the
  // read-only "watch" experience (only the assigned scorer can actually score).
  useFocusEffect(
    useCallback(() => {
      loadScorecard(true);
      const poll = setInterval(() => {
        setMatch((cur) => {
          if (cur?.status === 'live') loadScorecard(false);
          return cur;
        });
      }, 6000);
      return () => clearInterval(poll);
    }, [loadScorecard])
  );

  const shareScorecard = async () => {
    if (!match) return;
    const t1 = match.team1?.name || 'Team 1';
    const t2 = match.team2?.name || 'Team 2';
    const caption = `🏏 ${t1} vs ${t2}\n${match.score1 || '—'} | ${match.score2 || '—'}\n${match.result || ''}\nvia Local Legends`;
    // Capture the scorecard as an image and share it; fall back to plain text.
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 0.95, result: 'tmpfile' });
      await RNShare.open({ url: uri, type: 'image/png', message: caption, failOnCancel: false });
    } catch (e) {
      try { await Share.share({ message: caption }); } catch {}
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>);

  }

  if (!match) {
    return (
      <View style={styles.centered}>
        <Icon name="alert-circle-outline" size={48} color={DS.coral} />
        <Text style={styles.errorText}>Scorecard not available</Text>
      </View>);

  }

  const t1 = match.team1?.name || 'Team 1';
  const t2 = match.team2?.name || 'Team 2';
  const isLive = match.status === 'live';
  // Default tab: LIVE while the match is live, SCORECARD otherwise — but once the
  // viewer taps a tab themselves, `tab` takes over and stays put across polls.
  const activeTab = tab || (isLive ? 'live' : 'scorecard');
  const TABS = [
    { key: 'info', label: 'INFO' },
    ...(isLive ? [{ key: 'live', label: 'LIVE' }] : []),
    { key: 'scorecard', label: 'SCORECARD' },
    { key: 'squads', label: 'SQUADS' },
    { key: 'overs', label: 'OVERS' },
  ];
  const inningsList = match.innings || [];
  const selectedInnings = inningsList[inningsTab] || inningsList[0];
  const liveInnings = inningsList[inningsList.length - 1];   // currently-batting innings

  return (
    <View style={styles.container}>
      {/* Brand bar */}
      <View style={styles.brandBar}>
        {navigation &&
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-left" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
        }
        <Text style={styles.brandText}>LOCAL LEGENDS</Text>
        {isLive
          ? <View style={styles.liveBadge}><View style={styles.liveBadgeDot} /><Text style={styles.liveBadgeText}>LIVE</Text></View>
          : <View style={{ width: 26 }} />}
      </View>

      {/* Match-center tab bar */}
      <View style={styles.matchTabBar}>
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <TouchableOpacity key={t.key} style={[styles.matchTab, active && styles.matchTabActive]} onPress={() => setTab(t.key)}>
              <Text style={[styles.matchTabText, active && styles.matchTabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12 }}>
       <View ref={shotRef} collapsable={false} style={{ backgroundColor: DS.bg, paddingBottom: 12 }}>
        {/* Compact score summary (both innings) — persistent context across every tab. */}
        <View style={styles.scoreSummary}>
          <View style={styles.scoreTeam}>
            <View style={[styles.scoreAvatar, { backgroundColor: DS.lime }]}>
              <Text style={styles.scoreAvatarText}>{t1[0]}</Text>
            </View>
            <Text style={styles.scoreTeamName} numberOfLines={1}>{t1}</Text>
            <Text style={styles.scoreValue}>{match.score1 || '—'}</Text>
          </View>
          <View style={styles.scoreVs}>
            <Text style={styles.scoreVsText}>VS</Text>
          </View>
          <View style={[styles.scoreTeam, { alignItems: 'flex-end' }]}>
            <View style={[styles.scoreAvatar, { backgroundColor: DS.coral }]}>
              <Text style={styles.scoreAvatarText}>{t2[0]}</Text>
            </View>
            <Text style={[styles.scoreTeamName, { textAlign: 'right' }]} numberOfLines={1}>{t2}</Text>
            <Text style={[styles.scoreValue, { textAlign: 'right' }]}>{match.score2 || '—'}</Text>
          </View>
        </View>

        {/* Result */}
        {match.result &&
        <View style={styles.resultBanner}>
            <Icon name="trophy" size={16} color={DS.lime} />
            <Text style={styles.resultBannerText}>{match.result}</Text>
          </View>
        }

        <View style={styles.body}>
          {activeTab === 'info' && <InfoTab match={match} />}

          {activeTab === 'live' && <LiveTab innings={liveInnings} squads={match.squads} onViewAllOvers={() => setTab('overs')} />}

          {(activeTab === 'scorecard' || activeTab === 'overs') && inningsList.length > 1 &&
            <View style={styles.inningsTabs}>
              {inningsList.map((inn, i) => {
                const active = inningsTab === i;
                return (
                  <TouchableOpacity key={inn.id || i} style={[styles.inningsTab, active && styles.inningsTabActive]}
                    onPress={() => setInningsTab(i)}>
                    <Text style={[styles.inningsTabText, active && styles.inningsTabTextActive]} numberOfLines={1}>
                      {(inn.battingTeam?.name || `Innings ${i + 1}`).toUpperCase()}
                    </Text>
                    <Text style={[styles.inningsTabSub, active && { color: DS.bg }]}>{i === 0 ? '1st' : '2nd'} inns</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          }

          {activeTab === 'scorecard' &&
            (selectedInnings ? <InningsScorecard innings={selectedInnings} index={inningsList.indexOf(selectedInnings)} squads={match.squads} /> : <Text style={styles.emptyTabText}>No play yet.</Text>)}

          {activeTab === 'overs' &&
            (selectedInnings ? <InningsOvers innings={selectedInnings} /> : <Text style={styles.emptyTabText}>No overs yet.</Text>)}

          {activeTab === 'squads' && <SquadsTab match={match} />}
        </View>
        <Text style={styles.watermark}>Local Legends</Text>
       </View>

        {/* WhatsApp Share */}
        <TouchableOpacity style={styles.shareBtn} onPress={shareScorecard}>
          <Icon name="whatsapp" size={20} color="#fff" />
          <Text style={styles.shareBtnText}>Share Scorecard</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>);

}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },
  errorText: { fontSize: 16, color: DS.textMuted, marginTop: 12, fontWeight: '600' },

  // Brand bar
  brandBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16
  },
  brandText: {
    fontSize: 13, fontWeight: '900', color: DS.lime, letterSpacing: 2
  },
  backBtn: { padding: 4 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  liveBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: DS.live },
  liveBadgeText: { fontSize: 10, fontWeight: '900', color: DS.live, letterSpacing: 0.6 },

  // Match-center tab bar (INFO / LIVE / SCORECARD / SQUADS / OVERS)
  matchTabBar: {
    flexDirection: 'row', backgroundColor: DS.surfaceLow,
    borderBottomWidth: 1, borderBottomColor: DS.line,
  },
  matchTab: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  matchTabActive: { borderBottomColor: DS.lime },
  matchTabText: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.5 },
  matchTabTextActive: { color: DS.lime },

  // Score summary
  scoreSummary: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: DS.surfaceHigh, marginHorizontal: 16,
    borderRadius: 14, padding: 16
  },
  scoreTeam: { flex: 1, alignItems: 'flex-start', gap: 4 },
  scoreAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  scoreAvatarText: { fontSize: 15, fontWeight: '900', color: DS.bg },
  scoreTeamName: { fontSize: 12, color: DS.textMuted, fontWeight: '600' },
  scoreValue: { fontSize: 20, fontWeight: '900', color: DS.lime },
  scoreVs: { paddingHorizontal: 12 },
  scoreVsText: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 1 },

  // Result
  resultBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(171,214,0,0.08)', marginHorizontal: 16, marginTop: 12,
    borderRadius: 10, paddingVertical: 10,
    borderLeftWidth: 4, borderLeftColor: DS.lime
  },
  resultBannerText: { fontSize: 14, fontWeight: '700', color: DS.textPrimary },

  body: { paddingHorizontal: 16, gap: 16, marginTop: 8 },
  emptyTabText: { fontSize: 13, color: DS.textMuted, textAlign: 'center', paddingVertical: 24 },

  // Team / innings tabs
  inningsTabs: { flexDirection: 'row', gap: 8 },
  inningsTab: {
    flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8,
    alignItems: 'center', gap: 2,
  },
  inningsTabActive: { backgroundColor: DS.lime },
  inningsTabText: { fontSize: 12, fontWeight: '900', color: DS.textMuted, letterSpacing: 0.4 },
  inningsTabTextActive: { color: DS.bg },
  inningsTabSub: { fontSize: 10, fontWeight: '700', color: DS.textMuted },

  // Innings card
  inningsCard: {
    backgroundColor: DS.surfaceHigh, borderRadius: 14, overflow: 'hidden',
    paddingBottom: 8
  },

  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: DS.surfaceHighest
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inningsIndicator: {
    width: 4, height: 18, borderRadius: 2, backgroundColor: DS.lime
  },
  sectionHeaderText: {
    fontSize: 12, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.8
  },
  inningsLabel: { fontSize: 11, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.5 },
  inningsScoreBanner: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8
  },
  inningsScore: { fontSize: 26, fontWeight: '900', color: '#fff' },
  inningsOvers: { fontSize: 12, color: DS.textMuted },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: DS.surfaceHighest,
    paddingVertical: 8, paddingHorizontal: 12
  },
  tableRow: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12 },
  tableRowAlt: { backgroundColor: 'rgba(255,255,255,0.02)' },
  headerCell: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.5 },
  cell: { fontSize: 13, color: DS.textVariant },
  nameCol: { flex: 2.5 },
  numCol: { flex: 1, textAlign: 'center' },
  batterName: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  bowlerName: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  howOut: { fontSize: 10, color: DS.coral, marginTop: 1 },
  notOut: { fontSize: 10, color: DS.lime, marginTop: 1 },
  highlight: { color: DS.lime, fontWeight: '800' },
  yetToBatRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 8 },
  yetToBatLabel: { fontSize: 11, fontWeight: '700', color: DS.textMuted },
  yetToBatNames: { fontSize: 11, color: DS.textVariant, flex: 1 },

  extrasRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: DS.line, marginTop: 4 },
  extrasLabel: { fontSize: 12, fontWeight: '700', color: DS.textMuted, width: 52 },
  extrasDetail: { fontSize: 11, color: DS.textMuted, flex: 1 },
  extrasVal: { fontSize: 13, fontWeight: '800', color: DS.textPrimary },
  totalRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: DS.surfaceHigh, borderRadius: 8 },
  totalLabel: { fontSize: 13, fontWeight: '900', color: DS.textPrimary, width: 52, letterSpacing: 0.5 },
  totalDetail: { fontSize: 12, color: DS.textMuted, flex: 1 },
  totalVal: { fontSize: 16, fontWeight: '900', color: DS.lime },
  fowBox: { paddingHorizontal: 12, paddingTop: 10 },
  fowTitle: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 1, marginBottom: 4 },
  fowText: { fontSize: 11, color: DS.coral, lineHeight: 18 },

  // Over-by-over timeline (OVERS tab)
  overLine: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, gap: 8, borderTopWidth: 1, borderTopColor: DS.line },
  overLineNum: { fontSize: 11, fontWeight: '800', color: DS.textMuted, width: 40 },
  overLineBalls: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  overLineRuns: { fontSize: 13, fontWeight: '900', color: DS.textPrimary, width: 26, textAlign: 'right' },
  ballChip: { minWidth: 22, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6, backgroundColor: DS.surfaceHigh, alignItems: 'center' },
  ballChipW: { backgroundColor: DS.live },
  ballChipBoundary: { backgroundColor: DS.lime },
  ballChipExtra: { backgroundColor: 'rgba(255,181,158,0.18)' },
  ballChipText: { fontSize: 11, fontWeight: '800', color: DS.textPrimary },

  // LIVE tab: current-over box
  liveBox: { backgroundColor: DS.surfaceHigh, borderRadius: 14, padding: 14, gap: 10 },
  liveBoxHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveBoxOver: { fontSize: 14, fontWeight: '900', color: DS.textPrimary },
  liveBoxScore: { fontSize: 16, fontWeight: '900', color: DS.lime },
  liveBallRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  liveOverRuns: { fontSize: 11, color: DS.textMuted, marginLeft: 4 },
  liveFigRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 10,
    borderTopWidth: 1, borderTopColor: DS.line, paddingTop: 10,
  },
  liveFigText: { fontSize: 12, color: DS.textVariant, fontWeight: '600' },
  liveFigNum: { fontWeight: '900', color: DS.textPrimary },
  liveBoxLinks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  liveLinkText: { fontSize: 12, fontWeight: '700', color: DS.blue },
  liveSummaryText: { fontSize: 12, color: DS.textMuted, lineHeight: 18 },

  // LIVE tab: ball-by-ball commentary
  commentaryBox: { backgroundColor: DS.surfaceHigh, borderRadius: 14, paddingVertical: 4 },
  commentaryRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: DS.line },
  commentaryLabel: { fontSize: 12, fontWeight: '800', color: DS.textMuted, width: 34 },
  commentaryText: { flex: 1, fontSize: 13, color: DS.textVariant, lineHeight: 19 },

  // SQUADS tab
  squadsGrid: { flexDirection: 'row', gap: 14 },
  squadCol: { flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 14, padding: 12, gap: 2 },
  squadTeamName: { fontSize: 13, fontWeight: '900', color: DS.textPrimary, marginBottom: 6 },
  squadSectionLabel: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.8, marginBottom: 4 },
  squadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  squadAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  squadAvatarImg: { width: 30, height: 30, borderRadius: 15 },
  squadAvatarText: { fontSize: 12, fontWeight: '900', color: DS.lime },
  squadName: { fontSize: 12, fontWeight: '700', color: DS.textPrimary },
  squadRole: { fontSize: 10, color: DS.textMuted, marginTop: 1 },

  // INFO tab
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: DS.line },
  infoLabel: { fontSize: 12, color: DS.textMuted, fontWeight: '600' },
  infoValue: { fontSize: 12, color: DS.textPrimary, fontWeight: '700', flexShrink: 1, textAlign: 'right', marginLeft: 12 },

  // Share button
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#25D366', borderRadius: 14,
    paddingVertical: 14, marginHorizontal: 16, marginTop: 16
  },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  watermark: { textAlign: 'center', fontSize: 11, fontWeight: '900', color: DS.lime, letterSpacing: 2, marginTop: 10, opacity: 0.8 },
});
