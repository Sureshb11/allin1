import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Svg, { Polyline, Polygon, Circle, Line, Text as SvgText } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { getSport } from '../sports';
import { getCareerPanels, readStat } from '../sports/careerStats';
import { haptic } from '../utils/haptics';

// One career, drawn one way.
//
// This is the body of "My Stats", lifted out so that tapping a player in
// Rankings shows the same thing about them. That screen used to draw its own:
// colour-tinted bento tiles in three sections, off a separate endpoint with its
// own cricket maths — so the same career looked different and READ different
// depending on which way you came at it. One component, one payload
// (backend lib/playerCareer.js), one answer.
//
// Feed it the `stats` object from /users/me/stats or /players/:id/career.

// ── The honours cabinet ──────────────────────────────────────────────────────
// The five match awards the scorer's post-match popup has always handed out
// (backend lib/mvp.js) plus the four series ones, in the order they're worth
// bragging about. Icons match the popup, so an award looks the same the day it's
// won and every day after. `major` = a tournament honour: filled, not outlined.
const AWARD_KINDS = [
  { key: 'series',        label: 'Series',       icon: 'trophy-variant',   major: true },
  { key: 'motm',          label: 'MOM',          icon: 'star-four-points' },
  { key: 'fighter',       label: 'Fighter',      icon: 'arm-flex' },
  { key: 'batter',        label: 'Best Bat',     icon: 'cricket' },
  { key: 'bowler',        label: 'Best Bowl',    icon: 'bowling' },
  { key: 'fielder',       label: 'Best Field',   icon: 'hand-back-right' },
  { key: 'seriesBatter',  label: 'Series Bat',   icon: 'cricket',          major: true },
  { key: 'seriesBowler',  label: 'Series Bowl',  icon: 'bowling',          major: true },
  { key: 'seriesFielder', label: 'Series Field', icon: 'hand-back-right',  major: true },
];
const AWARD_ICON = Object.fromEntries(AWARD_KINDS.map((a) => [a.key, a.icon]));
const AWARD_NAME = {
  motm: 'Man of the Match', fighter: 'Fighter of the Match',
  batter: 'Best Batter', bowler: 'Best Bowler', fielder: 'Best Fielder',
};

// 1,284 reads faster than 1284 in a table of career totals.
const group = (v) => (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) >= 1000)
  ? String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  : v;

// ── Trend ────────────────────────────────────────────────────────────────────
// Width comes from the card, not from Dimensions at module load — the old chart
// was sized screen−48 inside a container of screen−58, so its last point and
// label were clipped off the right edge.
//
// There are no "M1 … Mn" axis labels: they numbered innings, not matches, and
// cost a whole label row to say nothing. In their place the chart earns its
// height — a dashed career mean to read each innings against, and the best one
// called out — which is what a trend is actually for.
function TrendChart({ values, color, width }) {
  const DS = useTheme().colors;
  const H = 86;
  const INSET = 7;                                   // keeps end dots off the edges
  const max = Math.max(...values, 1);
  const mean = values.reduce((t, v) => t + v, 0) / values.length;
  const best = Math.max(...values);
  const bestAt = values.indexOf(best);
  const plotW = Math.max(width - INSET * 2, 1);
  const stepX = plotW / Math.max(values.length - 1, 1);
  const x = (i) => INSET + i * stepX;
  const y = (v) => H - (v / max) * (H - 20);         // 20pt of headroom for the callout

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }).start();
  }, [values, anim]);

  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');

  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
      <Svg width={width} height={H}>
        <Polygon points={`${INSET},${H} ${points} ${x(values.length - 1)},${H}`} fill={color} fillOpacity={0.14} />
        {/* Career mean — the line every innings is judged against. */}
        <Line x1={0} y1={y(mean)} x2={width} y2={y(mean)} stroke={DS.textMuted} strokeWidth={1} strokeDasharray="3 4" opacity={0.7} />
        <Polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {values.map((v, i) => (
          <Circle key={i} cx={x(i)} cy={y(v)} r={i === bestAt ? 4.5 : 3} fill={i === bestAt ? color : DS.surface} stroke={color} strokeWidth={2} />
        ))}
        <SvgText x={x(bestAt)} y={y(best) - 8} fontSize="10" fontWeight="700" fill={color}
          textAnchor={bestAt === 0 ? 'start' : bestAt === values.length - 1 ? 'end' : 'middle'}>
          {best}
        </SvgText>
      </Svg>
    </Animated.View>
  );
}

/**
 * @param stats       the payload from /users/me/stats or /players/:id/career
 * @param sportId     which sport's panels to draw
 * @param navigation  optional — makes the form discs tap through to the match
 * @param captureRef  optional — a ViewShot ref for "share this card". The panel
 *                    segment sits OUTSIDE it, so a shared card is the numbers
 *                    rather than a screenshot of the app.
 * @param children    rendered inside the capture, under the chart (the share
 *                    footer on My Stats).
 */
export default function CareerBoard({ stats, sportId, navigation, captureRef, children }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const panels = getCareerPanels(sportId);
  const [tab, setTab] = useState(panels[0].id);
  const [chartW, setChartW] = useState(0);

  const activePanel = panels.find((p) => p.id === tab) || panels[0];
  const tabStats = stats
    ? activePanel.rows.map((r) => ({ label: r.label, value: readStat(r, stats) }))
    : [];

  const sportName = getSport(sportId)?.name || 'Cricket';
  const matches = stats?.matches ?? 0;
  // Older payloads only carried momCount, so that still stands in for the Man of
  // the Match count.
  const awardCounts = stats?.awards || { motm: stats?.momCount ?? 0 };
  const honours = AWARD_KINDS
    .map((a) => ({ ...a, n: awardCounts[a.key] || 0 }))
    .filter((a) => a.n > 0);

  // Last five completed matches, real results, reversed to run oldest → latest
  // so it reads in the same direction as the chart underneath it.
  const form = [...(stats?.recentForm || [])].reverse();
  // What each match contributed, in the terms of the panel being looked at.
  // Fielding and the event sports have nothing per-match to say, so the line
  // under the discs is dropped rather than filled with placeholders.
  const contribution = (m) =>
    tab === 'bowling' ? (m.wickets != null ? `${m.wickets}w` : null)
      : tab === 'batting' ? (m.runs != null ? `${m.runs}` : null)
      : null;
  const showContribution = form.some((m) => contribution(m) != null);
  const openMatch = (m) => {
    if (!navigation || !m.matchId) return;
    if (sportId === 'cricket') navigation.navigate('Scorecard', { matchId: m.matchId });
    else navigation.navigate('MatchStats', { matchId: m.matchId, sportName });
  };

  // Trend: cricket has real per-match series; other sports don't yet, so the
  // chart is omitted rather than showing invented numbers. Two points is the
  // minimum that makes a trend.
  const chartSeries = sportId === 'cricket'
    ? (tab === 'batting' ? stats?.recentScores : tab === 'bowling' ? stats?.recentWickets : stats?.recentCatches)
    : null;
  const chartData = chartSeries && chartSeries.length >= 2 ? chartSeries : [];
  // One accent, plus the app's wicket red where wickets are the subject.
  const chartColor = tab === 'bowling' ? DS.coral : DS.lime;
  const chartTitle = tab === 'batting' ? 'Scores' : tab === 'bowling' ? 'Wickets' : 'Catches & run outs';
  const chartAvg = chartData.length ? (chartData.reduce((t, v) => t + v, 0) / chartData.length).toFixed(1) : null;

  const selectPanel = (id) => { if (id !== tab) { haptic.tick(); setTab(id); } };

  return (
    <View style={styles.wrap}>
      {/* Panel segment — a one-panel sport has nothing to switch between, so the
          control doesn't render. Same pill shape and position as Rankings. */}
      {panels.length > 1 && (
        <View style={styles.segment}>
          {panels.map((p) => {
            const on = tab === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.segBtn, on && styles.segBtnOn]}
                onPress={() => selectPanel(p.id)}
                activeOpacity={0.85}>
                <Text style={[styles.segText, on && styles.segTextOn]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <ViewShot ref={captureRef} options={{ format: 'png', quality: 0.95 }} style={{ backgroundColor: DS.bg, gap: 10 }}>
        {/* Career line + last five results. */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardLabel}>{sportName.toUpperCase()} CAREER</Text>
            <Text style={styles.cardMetaText}>{matches} {matches === 1 ? 'match' : 'matches'}</Text>
          </View>

          {form.length > 0 && (
            <View style={styles.formRow}>
              {form.map((m, i) => {
                const won = m.result === 'W', lost = m.result === 'L';
                const latest = i === form.length - 1;
                // What was taken home from that match, if anything. `isMOM` is
                // the older field and only ever meant Man of the Match.
                const award = m.award || (m.isMOM ? 'motm' : null);
                return (
                  <TouchableOpacity
                    key={m.matchId || i}
                    style={styles.formCol}
                    activeOpacity={m.matchId && navigation ? 0.7 : 1}
                    onPress={() => openMatch(m)}
                    accessibilityLabel={`${won ? 'Won' : lost ? 'Lost' : 'Tied'} vs ${m.opponent || 'unknown'}`
                      + (award ? `, ${AWARD_NAME[award] || 'award'}` : '')}>
                    <View style={[styles.formDisc, {
                      backgroundColor: won ? DS.lime : lost ? DS.coral : DS.surfaceHighest,
                    }]}>
                      <Text style={[styles.formDiscText, {
                        color: won ? DS.onLime : lost ? '#fff' : DS.textMuted,
                      }]}>{m.result || 'T'}</Text>
                      {award && (
                        <View style={styles.formStar}>
                          <Icon name={AWARD_ICON[award] || 'star'} size={9} color={DS.onLime} />
                        </View>
                      )}
                    </View>
                    {showContribution && (
                      <Text style={[styles.formSub, latest && styles.formSubLatest]} numberOfLines={1}>
                        {contribution(m) || '·'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
              {/* Two matches played shouldn't stretch two discs across the card
                  — the strip always keeps its five-match pitch. */}
              {Array.from({ length: Math.max(0, 5 - form.length) }, (_, k) => (
                <View key={`gap${k}`} style={styles.formCol} />
              ))}
            </View>
          )}

          {/* Honours. Nothing renders for a career without any — an empty trophy
              shelf is worse than no shelf. */}
          {honours.length > 0 && (
            <View style={styles.honours}>
              {honours.map((a) => (
                <View key={a.key} style={[styles.honour, a.major && styles.honourMajor]}>
                  <Icon name={a.icon} size={11} color={a.major ? DS.onLime : DS.lime} />
                  <Text style={[styles.honourCount, a.major && styles.honourTextMajor]}>{a.n}</Text>
                  <Text style={[styles.honourLabel, a.major && styles.honourTextMajor]}>{a.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Career table: one surface ruled into thirds, not a grid of tiles. */}
        {tabStats.length > 0 && (
          <View style={styles.grid}>
            <View style={styles.gridHead}>
              <Text style={styles.cardLabel}>{activePanel.label.toUpperCase()}</Text>
            </View>
            {tabStats.map((s, i) => (
              <View key={s.label} style={[styles.cell, i >= 3 && styles.cellRule, i % 3 !== 0 && styles.cellDivide]}>
                <Text style={[styles.cellVal, i === 0 && styles.cellValLead]} numberOfLines={1}>{group(s.value)}</Text>
                <Text style={styles.cellLbl} numberOfLines={1}>{s.label}</Text>
              </View>
            ))}
            {/* Panels don't all divide by three (fielding has 3, hockey 4).
                Blank cells finish the last row so its rule spans the card
                instead of stopping a third of the way across. */}
            {Array.from({ length: (3 - tabStats.length % 3) % 3 }, (_, k) => {
              const i = tabStats.length + k;
              return <View key={`pad${k}`} style={[styles.cell, i >= 3 && styles.cellRule, i % 3 !== 0 && styles.cellDivide]} />;
            })}
          </View>
        )}

        {/* Trend — cricket only for now; other sports have no per-match series
            yet, and a chart of invented numbers is worse than none. */}
        {chartData.length > 0 && (
          <View style={styles.chartCard} onLayout={(e) => setChartW(e.nativeEvent.layout.width - 26)}>
            <View style={styles.cardHead}>
              <Text style={styles.cardLabel}>{chartTitle.toUpperCase()} · LAST {chartData.length}</Text>
              <Text style={styles.cardMetaText}>avg {chartAvg}</Text>
            </View>
            {chartW > 0 && <TrendChart values={chartData} color={chartColor} width={chartW} />}
          </View>
        )}

        {children}
      </ViewShot>
    </View>
  );
}

/**
 * Is there a career here at all? Both callers ask before drawing, because a
 * successful fetch is not the same as a player with something to show —
 * getUserStats resolves with `{}` for a signed-out or unlinked user, so `stats`
 * was always truthy and a brand-new player got a table of dashes instead of the
 * invitation to go and score one.
 */
export function hasCareer(stats, sportId) {
  if (!stats) return false;
  if ((stats.matches ?? 0) > 0 || (stats.recentForm || []).length > 0) return true;
  return getCareerPanels(sportId).some((p) =>
    p.rows.some((r) => { const v = readStat(r, stats); return v !== '—' && v !== 0; }));
}

const makeStyles = (DS) => StyleSheet.create({
  wrap: { gap: 10 },

  /* Panel segment — same shape as the Players/Teams toggle on Rankings. */
  segment: {
    flexDirection: 'row', gap: 4, padding: 3,
    backgroundColor: DS.surfaceHigh, borderRadius: 999, borderWidth: 1, borderColor: DS.faint,
  },
  segBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: 999 },
  segBtnOn: { backgroundColor: DS.lime },
  segText: { fontSize: 13, fontWeight: '700', color: DS.textMuted },
  segTextOn: { color: DS.onLime, fontWeight: '900' },

  /* Shared card chrome — one surface, a hairline, a tiny caps label. */
  card: { backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, paddingHorizontal: 13, paddingVertical: 12, gap: 11 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardLabel: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.7 },
  cardMetaText: { fontSize: 11, fontWeight: '700', color: DS.textVariant, fontVariant: ['tabular-nums'] },

  /* Honours: outlined for a match award, filled for a tournament one — so the
     rare thing looks rare without reaching for a second colour. */
  honours: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  honour: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.border,
  },
  honourMajor: { backgroundColor: DS.lime, borderColor: DS.lime },
  honourCount: { fontSize: 11, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  honourLabel: { fontSize: 9.5, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.3, textTransform: 'uppercase' },
  honourTextMajor: { color: DS.onLime },

  /* Last five results: won / lost / tied, tappable through to the match. */
  formRow: { flexDirection: 'row', gap: 8 },
  formCol: { flex: 1, alignItems: 'center', gap: 5 },
  formDisc: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  formDiscText: { fontSize: 13, fontWeight: '900' },
  // Badges any award won in that match, not just Man of the Match — the glyph
  // is the same one the post-match popup used to hand it over with.
  formStar: { position: 'absolute', top: -4, right: -5, width: 16, height: 16, borderRadius: 8, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: DS.surface },
  formSub: { fontSize: 10.5, fontWeight: '800', color: DS.textMuted, fontVariant: ['tabular-nums'] },
  // The strip runs oldest → latest, like the chart below it; the most recent
  // match is the one lit up, so which end is "now" needs no caption.
  formSubLatest: { color: DS.textPrimary },

  /* Career table: one card ruled into thirds instead of a grid of tiles. */
  grid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, overflow: 'hidden' },
  gridHead: { width: '100%', paddingHorizontal: 11, paddingTop: 12, paddingBottom: 1 },
  cell: { width: '33.333%', paddingVertical: 12, paddingHorizontal: 11, gap: 3 },
  cellRule: { borderTopWidth: 1, borderTopColor: DS.border },
  cellDivide: { borderLeftWidth: 1, borderLeftColor: DS.border },
  cellVal: { fontSize: 19, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'], letterSpacing: -0.4 },
  cellValLead: { color: DS.lime },
  cellLbl: { fontSize: 9.5, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },

  chartCard: { backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, paddingHorizontal: 13, paddingVertical: 12, gap: 8 },
});
