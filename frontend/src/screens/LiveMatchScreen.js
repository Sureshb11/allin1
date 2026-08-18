// Live Match — the spectator's screen (Live Telecast spec §12).
//
// The one place a viewer watches a Local Legends match: the telecast at the
// top, the live score under it, and the detail in tabs below. The video is the
// YouTube live broadcast the approved broadcaster is pushing; the score comes
// from the scorer, over the normal match API, and updates on its own.
//
// Why a WebView and not react-native-video: YouTube publishes no stream URL you
// may hand to a native player — its iframe player is the only supported way to
// show a YouTube live broadcast inside an app. `react-native-video` stays the
// right tool the day the video moves to an HLS provider.
//
// On the score being ahead of the picture: a YouTube live stream runs seconds
// behind real time, so the panel under the video would spoil a wicket before
// the viewer sees it. The score here is therefore deliberately the *headline*
// only, and the ball-by-ball detail lives a tab away rather than sitting under
// the player narrating the future. The burned-in overlay in the video is the
// one that is always in sync, because it is part of the picture.

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Dimensions, RefreshControl, Linking, UIManager,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import legendsApi from '../services/LegendsApi';
import ShotBoard from '../components/ShotBoard';
// The over rule from utils/cricketRules, not a local copy. The list here was
// correct, but four bugs today came from lists exactly like it being retyped
// and one copy drifting, so a fourth is not worth keeping.
import { isLegalDelivery as isLegal } from '../utils/cricketRules';

/**
 * Is the WebView's native side actually in this binary?
 *
 * react-native-webview was added with this screen, so any app built before it
 * has the JS but not the native view manager, and rendering a <WebView> there
 * throws an invariant that takes the whole screen down. Anyone running new JS
 * against an older build — which is every developer until the next rebuild,
 * and every user until the next release — gets the score and a link out
 * instead of a crash.
 */
const HAS_WEBVIEW = (() => {
  try {
    return Boolean(UIManager.getViewManagerConfig?.('RNCWebView'));
  } catch {
    return false;
  }
})();

const TABS = [
  { key: 'scorecard',  label: 'Scorecard',  icon: 'clipboard-text-outline' },
  { key: 'commentary', label: 'Commentary', icon: 'message-text-outline' },
  { key: 'players',    label: 'Players',    icon: 'account-group-outline' },
  { key: 'info',       label: 'Info',       icon: 'information-outline' },
];

// Shots is conditional — it only exists for matches where somebody actually
// captured them. A permanently empty tab on every other match would teach
// spectators to ignore the row.
const SHOTS_TAB = { key: 'shots', label: 'Shots', icon: 'chart-scatter-plot' };

/* ── Derivations ─────────────────────────────────────────────────────────────
   The headline score is NOT computed here. It comes from /live-summary, which
   is the same server function that feeds the broadcast overlay — so the score
   on this screen and the score burned into the video are produced once and
   cannot drift apart. A third implementation of "what is the score" is exactly
   the bug this design exists to prevent.

   What is left below is presentation-only: turning the full scorecard, fetched
   lazily when a tab needs it, into rows and commentary lines. */

function overs(legalBalls) {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

/** Per-batter row for the Scorecard tab. */
function batterCard(balls, playerId, nameOf) {
  if (!playerId) return null;
  const faced = balls.filter((b) => b.batterId === playerId);
  return {
    id: playerId,
    name: nameOf(playerId),
    runs: faced.reduce((n, b) => n + b.runs, 0),
    balls: faced.filter(isLegal).length,
  };
}

/**
 * Ball-by-ball lines, newest first — the Commentary tab.
 *
 * Purely presentation. The line itself comes from the server's `/scorecard`
 * response (`b.commentary`) — the same shot-aware engine the scorer's own
 * capture screen uses, run once on read rather than reimplemented here. This
 * function used to compose "FOUR! <batter> finds the fence" from raw runs on
 * every ball, which is a second commentary engine: it could not know a shot
 * had been recorded because the ball rows it received never carried
 * BallIntelligence, so a cover drive to Cover read exactly like a genuinely
 * untracked delivery, forever. Keeping cricket knowledge out of this screen
 * is what keeps the scorer's and the spectator's wording from being able to
 * drift apart the way the shot vocabulary itself once did.
 *
 * The one-line fallback below is a network/shape guard, not commentary logic:
 * if a row somehow arrives without the field, a spectator sees the runs
 * rather than a blank line — it does not attempt to describe the shot.
 */
function commentaryLines(inn, nameOf) {
  const out = [];
  for (const over of inn?.oversData || []) {
    let n = 0;
    for (const b of over.balls || []) {
      if (isLegal(b)) n += 1;
      const label = `${over.overNumber - 1}.${n || 1}`;
      const bowler = nameOf(b.bowlerId || over.bowlerId) || 'Bowler';
      const text = b.commentary || `${b.runs} run${b.runs === 1 ? '' : 's'}.`;
      out.push({ key: `${over.id}-${b.id}`, label, text, bowler, isWicket: b.isWicket, runs: b.runs, extraType: b.extraType });
    }
  }
  return out.reverse();
}

/* ── The player ──────────────────────────────────────────────────────────── */

/**
 * YouTube's iframe player, sized 16:9.
 *
 * `playsinline=1` matters on iOS: without it the video takes over the screen in
 * the native fullscreen player and the rest of this screen stops existing.
 */
function YouTubePlayer({ videoId, width }) {
  const html = useMemo(() => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body{margin:0;padding:0;background:#000;overflow:hidden;height:100%}
iframe{border:0;width:100%;height:100%;display:block}</style></head>
<body><iframe src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&modestbranding=1&rel=0"
 allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></body></html>`, [videoId]);

  return (
    <WebView
      source={{ html, baseUrl: 'https://www.youtube.com' }}
      style={{ width, height: width * 9 / 16, backgroundColor: '#000' }}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      domStorageEnabled
      allowsFullscreenVideo
      // Keeps navigation inside the player: a tapped YouTube link should open
      // in the browser, not replace the match screen with youtube.com.
      onShouldStartLoadWithRequest={(r) => {
        if (r.url.startsWith('about:') || r.url.includes('youtube.com/embed')) return true;
        if (r.navigationType === 'click') { Linking.openURL(r.url).catch(() => {}); return false; }
        return true;
      }}
    />
  );
}

/* ── Screen ──────────────────────────────────────────────────────────────── */

export default function LiveMatchScreen({ route, navigation }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const matchId = route?.params?.matchId;

  const [summary, setSummary] = useState(null);   // headline — polled
  const [match, setMatch] = useState(null);       // full scorecard — lazy
  const [broadcast, setBroadcast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('scorecard');
  const [intel, setIntel] = useState(null);   // { enabled, shots, summary, latest }
  const width = Dimensions.get('window').width;
  const pollRef = useRef(null);

  /** The small payload: headline score + whether there is video. Polled. */
  const loadLive = useCallback(async () => {
    if (!matchId) { setLoading(false); return; }
    const [ls, bc] = await Promise.all([
      legendsApi.getLiveSummary(matchId),
      legendsApi.getMatchBroadcast(matchId),
    ]);
    if (ls.success && ls.data) setSummary(ls.data);
    // A missing broadcast is not an error — most matches are scored but never
    // telecast, and that case must render as "no video", not as a failure.
    setBroadcast(bc.success ? bc.data : { onAir: false, youtubeVideoId: null, verified: {} });
    setLoading(false);
  }, [matchId]);

  /** The big payload: every delivery and both rosters. Only on demand. */
  const loadScorecard = useCallback(async () => {
    if (!matchId) return;
    const sc = await legendsApi.getScorecard(matchId);
    if (!sc.success || !sc.data) return;
    // Same "only take it if something changed" guard as loadIntel, and for the
    // same reason: this now polls every 6s while live, and the payload carries
    // both full squads — comparing the whole thing on every tick would cost
    // more than the re-render it exists to skip. A cheap signature is enough:
    // the last ball's id changes the moment a new delivery lands, and nothing
    // else in this payload changes without a new ball causing it to.
    setMatch((prev) => {
      const sig = (m) => {
        const inn = m?.innings?.[m.innings.length - 1];
        const overs = inn?.oversData || [];
        const last = overs[overs.length - 1]?.balls || [];
        return `${overs.length}:${last[last.length - 1]?.id || ''}`;
      };
      return prev && sig(prev) === sig(sc.data) ? prev : sc.data;
    });
  }, [matchId]);

  useEffect(() => { loadLive(); }, [loadLive]);

  /** Shot data. Fetched once to learn whether this match has any, then polled
      only if it does — most matches never will, and a spectator should not pay
      a request every six seconds for a feature nobody switched on. */
  const loadIntel = useCallback(async () => {
    if (!matchId) return;
    const r = await legendsApi.getMatchIntelligence(matchId);
    if (!r.success) return;
    // Only take the update when something ACTUALLY changed.
    //
    // A tracked innings draws roughly four hundred SVG nodes, and this polls
    // every six seconds for as long as somebody leaves the tab open. Setting
    // state unconditionally re-rendered the entire wheel on every poll to
    // produce a pixel-identical picture — between deliveries, which is most of
    // the time. Comparing the payload costs a sub-millisecond stringify of
    // ~20KB; the render it avoids costs far more, on the phone of the person
    // least likely to be plugged in.
    setIntel((prev) => {
      if (prev
        && prev.latest?.id === r.latest?.id
        && JSON.stringify(prev.shots) === JSON.stringify(r.shots)) return prev;
      return r;
    });
  }, [matchId]);

  useEffect(() => { loadIntel(); }, [loadIntel]);

  useEffect(() => {
    const live = summary?.status === 'live' || summary?.status === 'break';
    if (!live || !intel?.enabled) return undefined;
    const t = setInterval(loadIntel, 6000);
    return () => clearInterval(t);
  }, [summary?.status, intel?.enabled, loadIntel]);

  // Fetch the scorecard the first time a tab actually needs it, then keep it —
  // the tabs are cheap to switch between once it is in hand.
  useEffect(() => {
    if (!match && tab !== 'info') loadScorecard();
  }, [tab, match, loadScorecard]);

  // Keep it live once fetched, same 6s cadence as the headline. Before this,
  // the Commentary tab was fetched exactly once per visit — a spectator who
  // opened it and left it open never saw a later ball at all, shot-aware or
  // not, without a manual pull-to-refresh. This is what makes a delivery
  // scored on the ground actually arrive here on its own.
  useEffect(() => {
    if (!match) return undefined;
    const live = summary?.status === 'live' || summary?.status === 'break';
    if (!live) return undefined;
    const t = setInterval(loadScorecard, 6000);
    return () => clearInterval(t);
  }, [match, summary?.status, loadScorecard]);

  // Poll while the match is live, at the 6s the rest of the app uses. Stops the
  // moment the match is over, so a finished match costs nothing to sit on.
  useEffect(() => {
    const live = summary?.status === 'live' || summary?.status === 'break';
    if (!live) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return undefined;
    }
    pollRef.current = setInterval(loadLive, 6000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [summary?.status, loadLive]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadLive(), loadScorecard()]);
    setRefreshing(false);
  }, [loadLive, loadScorecard]);

  // ── Tab data ────────────────────────────────────────────────────────────
  // Only what the tabs need. The headline comes straight off `summary`.
  const detail = useMemo(() => {
    if (!match) return null;
    const innings = match.innings || [];
    const current = innings[innings.length - 1];
    const roster = [
      ...(match.squads || []).map((s) => s.player).filter(Boolean),
      ...(match.team1?.players || []),
      ...(match.team2?.players || []),
    ];
    const nameOf = (id) => roster.find((p) => p?.id === id)?.name || null;
    const balls = (current?.oversData || []).flatMap((o) =>
      (o.balls || []).map((b) => ({ ...b, overBowlerId: o.bowlerId })));
    return {
      current,
      nameOf,
      balls,
      overs: overs(balls.filter(isLegal).length),
      commentary: current ? commentaryLines(current, nameOf) : [],
    };
  }, [match]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={[styles.container, styles.center]}>
        <Icon name="television-off" size={40} color={DS.textMuted} />
        <Text style={styles.emptyText}>Match not found</Text>
      </View>
    );
  }

  const L = summary.live;
  const isLive = summary.status === 'live' || summary.status === 'break';
  const onAir = Boolean(broadcast?.onAir && broadcast?.youtubeVideoId);
  const v = broadcast?.verified || {};
  const firstInnings = (summary.innings || [])[0];
  const isChase = (L?.inningNumber ?? 1) >= 2 && firstInnings;

  return (
    <View style={styles.container}>
      {/* ── Video ─────────────────────────────────────────────────────────
          Black regardless of theme: it is a picture area, and a light frame
          around a dark video reads as a bug. */}
      <View style={[styles.videoWrap, { height: width * 9 / 16 }]}>
        {onAir && HAS_WEBVIEW ? (
          <YouTubePlayer videoId={broadcast.youtubeVideoId} width={width} />
        ) : onAir ? (
          // On air, but this binary can't play it in-app. Hand them the stream
          // rather than pretending there isn't one.
          <TouchableOpacity
            style={styles.videoPlaceholder}
            activeOpacity={0.85}
            onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${broadcast.youtubeVideoId}`).catch(() => {})}
          >
            <Icon name="youtube" size={38} color={DS.coral} />
            <Text style={styles.placeholderTitle}>Watch on YouTube</Text>
            <Text style={styles.placeholderSub}>In-app playback needs an app update.</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.videoPlaceholder}>
            <Icon name={isLive ? 'video-off-outline' : 'clock-outline'} size={34} color={DS.textMuted} />
            <Text style={styles.placeholderTitle}>
              {isLive ? 'No telecast for this match' : 'Not started yet'}
            </Text>
            <Text style={styles.placeholderSub}>
              {isLive
                ? 'The score is live — nobody is broadcasting video.'
                : 'Video appears here when the broadcast begins.'}
            </Text>
          </View>
        )}
        {onAir && (
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTagText}>LIVE</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} />}
      >
        {/* ── Headline score ────────────────────────────────────────────── */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreRow}>
            <View style={styles.teamCol}>
              <Text style={styles.teamName} numberOfLines={1}>
                {L?.battingTeam?.name || summary.teams?.team1?.name || 'Team A'}
              </Text>
              <Text style={styles.teamScore}>
                {L ? `${L.runs}-${L.wickets}` : '—'}
              </Text>
              <Text style={styles.teamOvers}>
                {L ? `${L.overs}${L.maxOvers ? `/${L.maxOvers}` : ''} ov` : ''}
              </Text>
            </View>

            <View style={styles.vsCol}>
              {isLive
                ? <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.livePillText}>LIVE</Text></View>
                : <Text style={styles.statusText}>{String(summary.status || '').toUpperCase()}</Text>}
            </View>

            <View style={[styles.teamCol, styles.teamColRight]}>
              <Text style={styles.teamName} numberOfLines={1}>
                {L?.bowlingTeam?.name || summary.teams?.team2?.name || 'Team B'}
              </Text>
              <Text style={styles.teamScoreAlt}>
                {isChase ? `${firstInnings.runs}-${firstInnings.wickets}` : '—'}
              </Text>
              <Text style={styles.teamOvers}>
                {isChase ? `${firstInnings.overs} ov` : ''}
              </Text>
            </View>
          </View>

          {/* The chase equation, when there is one. */}
          {L?.required > 0 && L?.ballsRemaining > 0 && (
            <Text style={styles.chase}>
              Need <Text style={styles.chaseNum}>{L.required}</Text> runs from{' '}
              <Text style={styles.chaseNum}>{L.ballsRemaining}</Text> balls
            </Text>
          )}

          {/* Who is at the crease. */}
          {isLive && (L?.striker || L?.bowler) && (
            <View style={styles.creaseRow}>
              {!!L.striker && (
                <Text style={styles.creaseText}>
                  <Text style={styles.creaseName}>{L.striker.name}*</Text> {L.striker.runs}({L.striker.balls})
                </Text>
              )}
              {!!L.nonStriker && (
                <Text style={styles.creaseText}>
                  <Text style={styles.creaseName}>{L.nonStriker.name}</Text> {L.nonStriker.runs}({L.nonStriker.balls})
                </Text>
              )}
              {!!L.bowler && (
                <Text style={[styles.creaseText, styles.creaseBowler]}>
                  <Text style={styles.creaseName}>{L.bowler.name}</Text> {L.bowler.wickets}-{L.bowler.runs}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* ── Verification (spec §12) ───────────────────────────────────── */}
        {(v.match || v.scorer || v.broadcaster) && (
          <View style={styles.verifyRow}>
            {v.match && <Badge styles={styles} DS={DS} text="Official Match" />}
            {v.scorer && <Badge styles={styles} DS={DS} text="Verified Scorer" />}
            {v.broadcaster && <Badge styles={styles} DS={DS} text="Verified Broadcaster" />}
          </View>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <View style={styles.tabBar}>
          {(intel?.enabled ? [...TABS, SHOTS_TAB] : TABS).map((t) => {
            const on = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, on && styles.tabOn]}
                onPress={() => setTab(t.key)}
                activeOpacity={0.85}
              >
                <Icon name={t.icon} size={14} color={on ? DS.lime : DS.textMuted} />
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* The tabs run off the full scorecard, which is fetched on demand —
            so they get a spinner on first open rather than blocking the video
            and the score behind a payload they don't need. */}
        {/* 'shots' is excluded alongside 'info': it runs off its own small
            payload, not the full scorecard, so waiting on that one would spin
            for a tab whose data is already in hand. */}
        {tab !== 'info' && tab !== 'shots' && !detail && (
          <ActivityIndicator style={styles.tabLoading} color={DS.lime} />
        )}
        {tab === 'scorecard'  && !!detail && <ScorecardTab  detail={detail} live={L} match={match} styles={styles} navigation={navigation} />}
        {tab === 'commentary' && !!detail && <CommentaryTab detail={detail} styles={styles} />}
        {tab === 'players'    && !!detail && <PlayersTab    match={match} styles={styles} />}
        {tab === 'info'       && <InfoTab summary={summary} match={match} broadcast={broadcast} styles={styles} />}
        {tab === 'shots'      && <ShotsTab intel={intel} styles={styles} DS={DS} />}
      </ScrollView>
    </View>
  );
}

/* ── Shots ───────────────────────────────────────────────────────────────────
   What the spectator gets that the scorer had to type: the last stroke, in
   words, and the wheel it landed on. They interact with none of it — the
   scorer answered the question, this is the processed result. */
function ShotsTab({ intel, styles, DS }) {
  const all = intel?.shots || [];
  const last = intel?.latest;
  const innings = intel?.innings || [];

  // ONE innings at a time. Plotting both on a single circle draws two teams'
  // batting on top of each other, and "scoring areas" computed across both is a
  // statistic about nobody. Defaults to the innings being played.
  const [pickedInning, setPickedInning] = useState(null);
  const active = pickedInning || last?.inningId || innings[innings.length - 1]?.id || null;

  // Filtered locally from what is already in hand — switching innings is a
  // state change, not a round trip. Memoised so the array KEEPS ITS IDENTITY
  // between polls: the wheel below is memoised too, and a fresh array on every
  // render would defeat it no matter how unchanged the contents were.
  const shots = useMemo(
    () => (active ? all.filter((s) => s.inningId === active) : all),
    [all, active],
  );
  const summary = intel?.byInnings?.find((i) => i.id === active)?.summary || intel?.summary;
  const hand = last?.batterHand || 'right';

  return (
    <View style={styles.shotsWrap}>
      {/* Only worth showing once a second innings actually has shots in it. */}
      {innings.length > 1 && (
        <View style={styles.inningsRow}>
          {innings.map((inn) => {
            const on = inn.id === active;
            return (
              <TouchableOpacity
                key={inn.id}
                style={[styles.inningsChip, on && styles.inningsChipOn]}
                onPress={() => setPickedInning(inn.id)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.inningsChipText, on && styles.inningsChipTextOn]} numberOfLines={1}>
                  {inn.battingTeam || `Innings ${inn.number}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* The live shot — the reason a spectator opens this tab mid-over. Hidden
          when looking at an innings it did not happen in: "the ball that just
          happened" is only true of the innings being played. */}
      {!!last && last.inningId === active && (
        <View style={styles.liveShot}>
          <View style={styles.liveShotHead}>
            <Text style={styles.liveShotOutcome}>{(last.outcome || '').toUpperCase()}</Text>
            {!!last.shotType && <Text style={styles.liveShotType}>{last.shotType.replace(/([A-Z])/g, ' $1').trim()}</Text>}
          </View>
          <Text style={styles.liveShotBatter}>{last.batter}</Text>
          {/* The commentary line is generated server-side from the same delivery,
              so it can never describe a ball differently from the scorecard. */}
          {!!last.commentary && <Text style={styles.liveShotLine}>{last.commentary}</Text>}
        </View>
      )}

      <ShotBoard
        shots={shots}
        summary={summary}
        hand={hand}
        title="WAGON WHEEL"
        subtitle={shots.length
          ? `${innings.find((i) => i.id === active)?.battingTeam || 'This innings'} — every recorded stroke`
          : null}
        style={{ marginTop: 12 }}
      />
    </View>
  );
}

function Badge({ styles, DS, text }) {
  return (
    <View style={styles.badge}>
      <Icon name="check-decagram" size={12} color={DS.lime} />
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

function ScorecardTab({ detail, live, match, styles, navigation }) {
  if (!detail?.current) return <Empty styles={styles} text="Scoring hasn’t started." />;
  const inn = detail.current;
  const batters = (match.squads || [])
    .filter((p) => p.teamId === inn.battingTeamId)
    .map((p) => ({ id: p.player?.id, name: p.player?.name, ...(batterCard(detail.balls, p.player?.id, detail.nameOf) || {}) }))
    // Everyone who has actually been to the crease. A named XI who has not
    // batted yet belongs on the Players tab, not padding the card with zeroes.
    .filter((b) => b.balls > 0 || b.runs > 0);

  return (
    <View style={styles.pane}>
      <Text style={styles.paneTitle}>
        {inn.battingTeam?.name} — {live ? `${live.runs}/${live.wickets}` : `${inn.totalRuns}/${inn.totalWickets}`} ({detail.overs} ov)
      </Text>
      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.thName]}>Batter</Text>
        <Text style={styles.th}>R</Text>
        <Text style={styles.th}>B</Text>
      </View>
      {batters.length === 0 && <Empty styles={styles} text="No deliveries yet." />}
      {batters.map((b) => (
        <View key={b.id} style={styles.tr}>
          <Text style={[styles.td, styles.tdName]} numberOfLines={1}>{b.name}</Text>
          <Text style={[styles.td, styles.tdNum]}>{b.runs}</Text>
          <Text style={[styles.td, styles.tdNum]}>{b.balls}</Text>
        </View>
      ))}
      <TouchableOpacity
        style={styles.fullBtn}
        onPress={() => navigation?.navigate('Scorecard', { matchId: match.id })}
        activeOpacity={0.85}
      >
        <Text style={styles.fullBtnText}>Full scorecard</Text>
      </TouchableOpacity>
    </View>
  );
}

function CommentaryTab({ detail, styles }) {
  const lines = detail?.commentary || [];
  if (lines.length === 0) return <Empty styles={styles} text="No commentary yet." />;
  return (
    <View style={styles.pane}>
      {lines.slice(0, 60).map((l) => (
        <View key={l.key} style={styles.commRow}>
          {/* A coloured chip carries white text — DS.textPrimary is near-black
              in the light theme and would vanish on coral. */}
          <View style={[
            styles.commBall,
            l.isWicket && styles.commBallW,
            !l.isWicket && l.runs === 4 && styles.commBall4,
            !l.isWicket && l.runs === 6 && styles.commBall6,
          ]}>
            <Text style={[
              styles.commBallText,
              (l.isWicket || l.runs === 4 || l.runs === 6) && styles.commBallTextOn,
            ]}>
              {l.isWicket ? 'W' : (l.extraType ? 'e' : l.runs)}
            </Text>
          </View>
          <View style={styles.commBody}>
            <Text style={styles.commLabel}>{l.label} · {l.bowler}</Text>
            <Text style={styles.commText}>{l.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function PlayersTab({ match, styles }) {
  const groups = [
    { name: match.team1?.name || 'Team A', players: (match.squads || []).filter((s) => s.teamId === match.team1Id) },
    { name: match.team2?.name || 'Team B', players: (match.squads || []).filter((s) => s.teamId === match.team2Id) },
  ];
  if (groups.every((g) => g.players.length === 0)) return <Empty styles={styles} text="Squads not named yet." />;
  return (
    <View style={styles.pane}>
      {groups.map((g) => (
        <View key={g.name} style={styles.group}>
          <Text style={styles.groupTitle}>{g.name}</Text>
          {g.players.map((p) => (
            <View key={p.id} style={styles.tr}>
              <Text style={[styles.td, styles.tdName]} numberOfLines={1}>{p.player?.name}</Text>
              <Text style={styles.tdRole}>{p.player?.role || ''}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// Reads from the headline summary so it renders before the scorecard lands,
// filling in the fields only the full payload carries once it arrives.
function InfoTab({ summary, match, broadcast, styles }) {
  const rows = [
    ['Venue', summary?.venue || '—'],
    ['Format', match?.matchType || '—'],
    ['Overs', summary?.live?.maxOvers ? String(summary.live.maxOvers) : '—'],
    ['Ball', match?.ballType || '—'],
    ['Status', String(summary?.status || '—').toUpperCase()],
    ['Broadcaster', broadcast?.broadcaster || 'Not broadcast'],
  ];
  return (
    <View style={styles.pane}>
      {rows.map(([k, val]) => (
        <View key={k} style={styles.infoRow}>
          <Text style={styles.infoKey}>{k}</Text>
          <Text style={styles.infoVal}>{val}</Text>
        </View>
      ))}
    </View>
  );
}

function Empty({ styles, text }) {
  return <Text style={styles.paneEmpty}>{text}</Text>;
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: DS.textVariant, fontSize: 15, fontWeight: '700' },

  /* Video */
  videoWrap: { width: '100%', backgroundColor: '#000', justifyContent: 'center' },
  videoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 32 },
  placeholderTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  placeholderSub: { color: DS.textMuted, fontSize: 12, textAlign: 'center' },
  liveTag: {
    position: 'absolute', top: 10, left: 12, flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: DS.coral, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
  },
  liveTagText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  /* Score */
  scoreCard: { backgroundColor: DS.surfaceLow, paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-start' },
  teamCol: { flex: 1, gap: 2 },
  teamColRight: { alignItems: 'flex-end' },
  teamName: { fontSize: 12, fontWeight: '700', color: DS.textVariant, textTransform: 'uppercase', letterSpacing: 0.4 },
  teamScore: { fontSize: 26, fontWeight: '900', color: DS.lime, fontVariant: ['tabular-nums'] },
  teamScoreAlt: { fontSize: 26, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  teamOvers: { fontSize: 11, fontWeight: '700', color: DS.textMuted, fontVariant: ['tabular-nums'] },
  vsCol: { paddingHorizontal: 12, paddingTop: 14 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: DS.coral, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  livePillText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  statusText: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.8 },

  chase: { fontSize: 13, fontWeight: '700', color: DS.textVariant },
  chaseNum: { color: DS.lime, fontWeight: '900' },

  creaseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, borderTopWidth: 1, borderTopColor: DS.faint, paddingTop: 10 },
  creaseText: { fontSize: 12, color: DS.textVariant, fontWeight: '600', fontVariant: ['tabular-nums'] },
  creaseName: { color: DS.textPrimary, fontWeight: '800' },
  creaseBowler: { marginLeft: 'auto' },

  /* Verification */
  verifyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.faint,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: DS.textVariant },

  /* Tabs — the app's filter-bar language: an underline, not a pill row. */
  tabBar: {
    flexDirection: 'row', gap: 20, paddingHorizontal: 16, marginTop: 14,
    borderBottomWidth: 1, borderBottomColor: DS.faint,
  },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: DS.lime },
  tabText: { fontSize: 12, fontWeight: '600', color: DS.textMuted },
  tabTextOn: { color: DS.lime, fontWeight: '800' },

  /* Panes */
  pane: { paddingHorizontal: 16, paddingTop: 14, gap: 2 },
  paneTitle: { fontSize: 14, fontWeight: '800', color: DS.textPrimary, marginBottom: 8 },
  paneEmpty: { fontSize: 13, color: DS.textMuted, paddingHorizontal: 16, paddingTop: 24, textAlign: 'center' },
  tabLoading: { marginTop: 28 },

  /* Shots tab */
  shotsWrap: { paddingHorizontal: 14, paddingTop: 14 },
  inningsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  inningsChip: {
    flex: 1, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 999,
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.surfaceHighest, alignItems: 'center',
  },
  inningsChipOn: { backgroundColor: DS.lime, borderColor: DS.lime },
  inningsChipText: { color: DS.textPrimary, fontSize: 12, fontWeight: '700' },
  inningsChipTextOn: { color: DS.bg, fontWeight: '900' },
  liveShot: {
    backgroundColor: DS.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: DS.surfaceHighest, borderLeftWidth: 3, borderLeftColor: DS.lime,
  },
  liveShotHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  liveShotOutcome: { color: DS.lime, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  liveShotType: { color: DS.textPrimary, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  liveShotBatter: { color: DS.textMuted, fontSize: 12, fontWeight: '700', marginTop: 3, letterSpacing: 0.4 },
  liveShotLine: { color: DS.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 9 },

  tableHead: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: DS.faint },
  th: { width: 40, fontSize: 10, fontWeight: '800', color: DS.textMuted, textAlign: 'right', letterSpacing: 0.5 },
  thName: { flex: 1, textAlign: 'left' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: DS.faint },
  td: { fontSize: 13, color: DS.textPrimary },
  tdName: { flex: 1, fontWeight: '700' },
  tdNum: { width: 40, textAlign: 'right', fontWeight: '800', fontVariant: ['tabular-nums'] },
  tdRole: { fontSize: 11, color: DS.textMuted, fontWeight: '600' },

  fullBtn: { marginTop: 14, alignSelf: 'flex-start', backgroundColor: DS.surfaceHigh, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: DS.faint },
  fullBtnText: { fontSize: 12, fontWeight: '800', color: DS.lime },

  group: { marginBottom: 18 },
  groupTitle: { fontSize: 12, fontWeight: '800', color: DS.lime, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },

  commRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: DS.faint },
  commBall: { width: 26, height: 26, borderRadius: 13, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  commBallW: { backgroundColor: DS.coral },
  commBall4: { backgroundColor: DS.blueDeep },
  commBall6: { backgroundColor: '#7b3fe4' },
  commBallText: { fontSize: 11, fontWeight: '900', color: DS.textPrimary },
  commBallTextOn: { color: '#fff' },
  commBody: { flex: 1, gap: 2 },
  commLabel: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.4 },
  commText: { fontSize: 13, color: DS.textPrimary, lineHeight: 18 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: DS.faint },
  infoKey: { fontSize: 12, fontWeight: '700', color: DS.textMuted },
  infoVal: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
});
