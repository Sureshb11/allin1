// The wagon wheel with its numbers underneath.
//
// Shared by the match summary and the player profile so the same shot data can
// never be drawn two different ways in two places. The spectator's live card is
// separate — that one is about the ball that JUST happened, which is a different
// question from "what does all of this add up to".
//
// `insights` is optional. Pass it on a player profile, where a trend across many
// innings is a real claim; leave it off for a single match, where it is not.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { cricketColors } from '../theme/cricketColors';
import WagonWheel, { HandBadge } from './WagonWheel';

/** The wheel's colour key. Without it, four line colours are just decoration. */
function Legend({ c }) {
  // Same source as the wheel draws from — a legend that picks its own colours
  // is a legend that eventually describes a different picture.
  const CK = cricketColors(c);
  const items = [
    { label: '6', color: CK.six },
    { label: '4', color: CK.four },
    { label: '1-3', color: CK.runs },
    { label: 'W', color: CK.wicket },
  ];
  return (
    <View style={lg.row}>
      {items.map((i) => (
        <View key={i.label} style={lg.item}>
          <View style={[lg.dot, { backgroundColor: i.color }]} />
          <Text style={[lg.text, { color: c.textMuted }]}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

const lg = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
});

/** One row of a "where the runs went" table. */
function StatRow({ s, row, max }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel} numberOfLines={1}>{row.label}</Text>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${max ? Math.max(4, (row.runs / max) * 100) : 0}%` }]} />
      </View>
      <Text style={s.rowRuns}>{row.runs}</Text>
      <Text style={s.rowMeta}>{row.balls}b</Text>
    </View>
  );
}

export default function ShotBoard({
  shots = [],
  summary = null,
  insights = null,
  // The fuller picture: phase splits, pace vs spin, boundary and dot areas.
  // Optional — a match board has no business claiming any of it.
  dna = null,
  // Comparison against a licensed benchmark, when one has been linked. Null for
  // almost every player, and rendered only when present.
  benchmark = null,
  hand = 'right',
  // Whether to name the batting hand under the wheel. True for ONE player's
  // board, where it is the fact that makes the picture readable. False for a
  // whole match, where the shots belong to a dozen batters of both hands and
  // naming one of them would be a confident lie. The plotted lines are absolute
  // field angles either way, so the drawing is correct regardless; only the
  // wedge labels depend on a hand, and display mode does not draw them.
  showHand = false,
  title = 'BALL INTELLIGENCE',
  subtitle = null,
  style,
}) {
  const c = useTheme().colors;
  const s = useMemo(() => makeStyles(c), [c]);

  // Nothing captured is a real and common state — the feature is optional and
  // most matches will never use it. Say so plainly instead of drawing an empty
  // wheel that looks like a bug.
  if (!shots.length) {
    return (
      <View style={[s.card, style]}>
        <Text style={s.title}>{title}</Text>
        <View style={s.empty}>
          <Icon name="chart-scatter-plot" size={26} color={c.textMuted} />
          <Text style={s.emptyText}>No shots were recorded here.</Text>
          <Text style={s.emptyHint}>Turn Ball Intelligence on at the toss to capture where each ball goes.</Text>
        </View>
      </View>
    );
  }

  const topZones = summary?.topZones || [];
  const topShots = summary?.topShots || [];
  const maxZoneRuns = Math.max(1, ...topZones.map((z) => z.runs));
  const maxShotRuns = Math.max(1, ...topShots.map((z) => z.runs));

  return (
    <View style={[s.card, style]}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{title}</Text>
          {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
        </View>
        <Text style={s.count}>{shots.length} BALLS</Text>
      </View>

      <View style={s.wheelWrap}>
        <WagonWheel size={260} hand={hand} mode="display" shots={shots} showLabels={false} />
      </View>
      {showHand && <HandBadge hand={hand} />}
      <Legend c={c} />

      {/* Every figure here is over CAPTURED deliveries only. Saying so once, up
          front, stops a partly-tracked innings from reading as a collapse in
          scoring rate that never happened. */}
      <Text style={s.caveat}>Figures cover the {shots.length} deliveries where a shot was recorded.</Text>

      {topZones.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>SCORING AREAS</Text>
          {topZones.map((z) => <StatRow key={z.key} s={s} row={z} max={maxZoneRuns} />)}
        </View>
      )}

      {topShots.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>FAVOURITE SHOTS</Text>
          {topShots.map((z) => <StatRow key={z.key} s={s} row={z} max={maxShotRuns} />)}
        </View>
      )}

      {/* ── Player DNA ──────────────────────────────────────────────────────
          Each block carries its OWN coverage, because they do not share one. A
          player can have three hundred balls of zone data and eleven balls
          against recorded spin, and printing both in the same typeface would
          quietly invent the second. Blocks below 50% coverage are not drawn:
          a split built mostly out of blanks is a fact about missing data. */}
      {dna?.phases?.rows?.length > 0 && dna.phases.coverage >= 50 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>BY PHASE</Text>
          <View style={s.splitRow}>
            {dna.phases.rows.map((p) => (
              <View key={p.key} style={s.split}>
                <Text style={s.splitSR}>{p.strikeRate ?? '—'}</Text>
                <Text style={s.splitLabel}>{p.label.toUpperCase()}</Text>
                <Text style={s.splitMeta}>{p.balls}b</Text>
              </View>
            ))}
          </View>
          {dna.phases.coverage < 100 && (
            <Text style={s.thin}>Based on {dna.phases.coverage}% of tracked deliveries.</Text>
          )}
        </View>
      )}

      {dna?.bowling?.rows?.length > 0 && dna.bowling.coverage >= 50 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>PACE VS SPIN</Text>
          <View style={s.splitRow}>
            {dna.bowling.rows.map((p) => (
              <View key={p.key} style={s.split}>
                <Text style={s.splitSR}>{p.strikeRate ?? '—'}</Text>
                <Text style={s.splitLabel}>{p.label.toUpperCase()}</Text>
                <Text style={s.splitMeta}>{p.balls}b</Text>
              </View>
            ))}
          </View>
          {/* Named explicitly: most bowlers in this app have never recorded a
              bowling style, so this split is usually built on a minority. */}
          <Text style={s.thin}>
            Based on {dna.bowling.coverage}% of tracked deliveries — only bowlers
            whose style is on record can be counted.
          </Text>
        </View>
      )}

      {dna?.boundaryAreas?.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>BOUNDARY AREAS</Text>
          {dna.boundaryAreas.map((z) => (
            <View key={z.key} style={s.row}>
              <Text style={s.rowLabel} numberOfLines={1}>{z.label}</Text>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${Math.max(4, (z.boundaries / dna.boundaryAreas[0].boundaries) * 100)}%` }]} />
              </View>
              <Text style={s.rowRuns}>{z.boundaries}</Text>
              <Text style={s.rowMeta}>{z.balls}b</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Benchmark ───────────────────────────────────────────────────────
          Only when somebody has linked a licensed source to this player. The
          app never fetches these; absence is the normal state and is silent. */}
      {benchmark?.byShot?.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>VS {String(benchmark.level || '').toUpperCase()} BENCHMARK</Text>
          {benchmark.byShot.slice(0, 5).map((b) => {
            const up = (b.differencePercent || 0) > 0;
            return (
              <View key={b.key} style={s.row}>
                <Text style={s.rowLabel} numberOfLines={1}>{b.label}</Text>
                <Text style={s.benchMine}>{b.player.strikeRate}</Text>
                <Text style={s.benchVs}>vs {b.benchmark.strikeRate}</Text>
                <Text style={[s.benchDiff, { color: up ? c.lime : (c.wicketText || c.danger) }]}>
                  {up ? '+' : ''}{b.differencePercent}%
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Strengths and weaknesses only where a trend is a fair thing to claim —
          a player profile, not one afternoon. */}
      {insights && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>WHAT THIS SUGGESTS</Text>
          {!insights.strengths?.length && !insights.weaknesses?.length ? (
            <Text style={s.thin}>
              Nothing stands out yet — every split so far is either too small to call
              or close to this player&apos;s own average.
            </Text>
          ) : (
            <>
              {insights.strengths?.slice(0, 4).map((i) => (
                <View key={`s-${i.kind}-${i.key}`} style={s.insight}>
                  <Icon name="trending-up" size={14} color={c.lime} />
                  <Text style={s.insightLabel} numberOfLines={1}>{i.label}</Text>
                  <Text style={[s.insightSR, { color: c.lime }]}>SR {i.strikeRate}</Text>
                  <Text style={s.insightConf}>{i.confidence.label}</Text>
                </View>
              ))}
              {insights.weaknesses?.slice(0, 4).map((i) => (
                <View key={`w-${i.kind}-${i.key}`} style={s.insight}>
                  <Icon name="trending-down" size={14} color={c.wicketText || c.danger} />
                  <Text style={s.insightLabel} numberOfLines={1}>{i.label}</Text>
                  <Text style={[s.insightSR, { color: c.wicketText || c.danger }]}>SR {i.strikeRate}</Text>
                  <Text style={s.insightConf}>{i.confidence.label}</Text>
                </View>
              ))}
            </>
          )}
          {/* "No weaknesses" and "not enough balls to say" are different claims,
              and the second one must not be allowed to read as the first. */}
          {insights.withheld > 0 && (
            <Text style={s.thin}>
              {insights.withheld} more {insights.withheld === 1 ? 'area needs' : 'areas need'} a
              bigger sample before anything can be said about {insights.withheld === 1 ? 'it' : 'them'}.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  card: {
    backgroundColor: c.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: c.surfaceHighest,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { color: c.textPrimary, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  subtitle: { color: c.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
  count: { color: c.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  wheelWrap: { alignItems: 'center', marginTop: 8, marginBottom: 6 },
  caveat: { color: c.textMuted, fontSize: 10, textAlign: 'center', marginTop: 10, lineHeight: 14 },
  section: { marginTop: 16 },
  sectionTitle: { color: c.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  rowLabel: { color: c.textPrimary, fontSize: 12, fontWeight: '700', width: 92 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.surfaceHigh, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: c.lime },
  rowRuns: { color: c.textPrimary, fontSize: 12, fontWeight: '900', width: 30, textAlign: 'right' },
  rowMeta: { color: c.textMuted, fontSize: 10, fontWeight: '600', width: 30, textAlign: 'right' },
  insight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  insightLabel: { color: c.textPrimary, fontSize: 12, fontWeight: '700', flex: 1 },
  insightSR: { fontSize: 12, fontWeight: '900' },
  insightConf: { color: c.textMuted, fontSize: 9, fontWeight: '700', width: 76, textAlign: 'right' },
  thin: { color: c.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  splitRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  split: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
    backgroundColor: c.surfaceHigh, borderWidth: 1, borderColor: c.surfaceHighest,
  },
  splitSR: { color: c.lime, fontSize: 18, fontWeight: '900' },
  splitLabel: { color: c.textPrimary, fontSize: 9, fontWeight: '800', letterSpacing: 0.5, marginTop: 3, textAlign: 'center' },
  splitMeta: { color: c.textMuted, fontSize: 9, fontWeight: '600', marginTop: 1 },
  benchMine: { color: c.textPrimary, fontSize: 12, fontWeight: '900', width: 38, textAlign: 'right' },
  benchVs: { color: c.textMuted, fontSize: 11, fontWeight: '600', width: 52, textAlign: 'right' },
  benchDiff: { fontSize: 12, fontWeight: '900', width: 54, textAlign: 'right' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 22 },
  emptyText: { color: c.textPrimary, fontSize: 13, fontWeight: '700' },
  emptyHint: { color: c.textMuted, fontSize: 11, textAlign: 'center', lineHeight: 16, paddingHorizontal: 20 },
});
