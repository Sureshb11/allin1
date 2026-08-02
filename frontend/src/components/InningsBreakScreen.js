import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Image, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { makeControls, controlColors } from '../theme/controls';
import legendsApi from '../services/LegendsApi';
import { haptic } from '../utils/haptics';

// The interval.
//
// The first innings used to end straight into "SELECT PLAYERS" for the second —
// past the summary everyone wants at the break, and with no way to change who is
// scoring. Two things happen here:
//
//   1. What just happened: the innings total, run rate, the target, and the top
//      three with bat and ball.
//   2. Who scores the second half. Local cricket normally splits it — each side
//      scores the innings they're fielding — so handing over is a first-class
//      action, with the OPPONENT's players listed first. A club with a dedicated
//      scorer just taps Continue; nothing is forced.
//
// The hand-over is real: Match.scorerId moves, and every scoring write is gated
// on it (backend assertScorer), so this device genuinely stops being able to
// score once it's done.

function Figure({ label, value, sub }) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.figure}>
      <Text style={s.figureVal} numberOfLines={1}>{value}</Text>
      <Text style={s.figureLbl} numberOfLines={1}>{label}</Text>
      {!!sub && <Text style={s.figureSub} numberOfLines={1}>{sub}</Text>}
    </View>
  );
}

export default function InningsBreakScreen({ data, matchId, venue, onContinue, onHandedOver, onResumeFirst }) {
  const DS = useTheme().colors;
  const s = useThemedStyles(makeStyles);
  const C = useThemedStyles(makeControls);
  // controls.js resolves its palette per theme, so this has to come from the
  // function rather than a module constant — dark mode has different greens.
  const CONTROL = controlColors(DS);

  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [handing, setHanding] = useState(null);   // userId mid-transfer
  const [error, setError] = useState(null);
  const [undoing, setUndoing] = useState(false);

  const openPicker = useCallback(async () => {
    haptic.tick();
    setPicking(true);
    setError(null);
    if (candidates.length) return;                // already fetched once
    setLoading(true);
    // getScorerInfo already returns the squad's registered users, minus the
    // current scorer, with team + isOpponent for grouping.
    const res = await legendsApi.getScorerInfo(matchId);
    setLoading(false);
    if (!res.success) { setError(res.error || 'Could not load the squad'); return; }
    setCandidates(res.candidates || []);
  }, [matchId, candidates.length]);

  const handOver = useCallback(async (c) => {
    setHanding(c.userId);
    setError(null);
    const res = await legendsApi.transferScorer(matchId, c.userId);
    setHanding(null);
    if (!res.success) { setError(res.error || 'Could not hand over scoring'); return; }
    haptic.success();
    setPicking(false);
    onHandedOver?.(c.name);
  }, [matchId, onHandedOver]);

  // The endpoint already excludes the current scorer.
  const opponents = candidates.filter((c) => c.isOpponent);
  const others = candidates.filter((c) => !c.isOpponent);

  const Row = ({ c }) => (
    <TouchableOpacity
      style={s.candidate}
      activeOpacity={0.8}
      disabled={!!handing}
      onPress={() => handOver(c)}>
      {c.avatarUrl
        ? <Image source={{ uri: c.avatarUrl }} style={s.candidateAvatar} />
        : <View style={[s.candidateAvatar, s.candidateAvatarFallback]}>
            <Text style={s.candidateInitial}>{(c.name || '?').charAt(0).toUpperCase()}</Text>
          </View>}
      <View style={{ flex: 1 }}>
        <Text style={s.candidateName} numberOfLines={1}>{c.name}</Text>
        {!!c.teamName && <Text style={s.candidateTeam} numberOfLines={1}>{c.teamName}</Text>}
      </View>
      {handing === c.userId
        ? <ActivityIndicator size="small" color={CONTROL.green} />
        : <Icon name="chevron-right" size={20} color={DS.textMuted} />}
    </TouchableOpacity>
  );

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.badge}>
          <Icon name="timer-sand" size={14} color={CONTROL.green} />
          <Text style={s.badgeTxt}>INNINGS BREAK</Text>
        </View>

        {/* What just happened */}
        <View style={s.scoreCard}>
          <Text style={s.teamLine} numberOfLines={1}>{data.battingTeam}</Text>
          <Text style={s.score}>{data.score}</Text>
          <Text style={s.oversLine}>
            {data.overs} / {data.totalOvers} ov · RR {data.runRate}
          </Text>
          {!!data.reason && <Text style={s.reason} numberOfLines={1}>{data.reason}</Text>}
        </View>

        {/* The number that matters next */}
        <View style={s.targetCard}>
          <Icon name="target" size={18} color={CONTROL.onGreen} />
          <Text style={s.targetTxt}>
            {data.bowlingTeam} need <Text style={s.targetNum}>{data.target}</Text> to win
          </Text>
        </View>

        {data.batters.length > 0 && (
          <View style={C.card}>
            <Text style={C.cardLabel}>BATTING</Text>
            <View style={s.figureRow}>
              {data.batters.map((b, i) => (
                <Figure key={i} value={`${b.runs || 0}`} label={b.name}
                  sub={`${b.balls || 0}b · ${b.fours || 0}×4 ${b.sixes || 0}×6`} />
              ))}
            </View>
          </View>
        )}

        {data.bowlers.length > 0 && (
          <View style={C.card}>
            <Text style={C.cardLabel}>BOWLING</Text>
            <View style={s.figureRow}>
              {data.bowlers.map((b, i) => (
                <Figure key={i} value={`${b.wickets || 0}/${b.runs || 0}`} label={b.name}
                  sub={`${Math.floor((b.balls || 0) / 6)}.${(b.balls || 0) % 6} ov`} />
              ))}
            </View>
          </View>
        )}

        {/* Match details */}
        <View style={C.card}>
          <Text style={C.cardLabel}>MATCH</Text>
          <View style={s.detailRow}>
            <Icon name="cricket" size={14} color={DS.textMuted} />
            <Text style={s.detailTxt} numberOfLines={1}>{data.battingTeam} v {data.bowlingTeam}</Text>
          </View>
          <View style={s.detailRow}>
            <Icon name="timer-outline" size={14} color={DS.textMuted} />
            <Text style={s.detailTxt}>{data.totalOvers} overs a side</Text>
          </View>
          {!!venue && (
            <View style={s.detailRow}>
              <Icon name="map-marker-outline" size={14} color={DS.textMuted} />
              <Text style={s.detailTxt} numberOfLines={1}>{venue}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Ended the wrong innings? A mis-tap on the reason picker shouldn't cost
          you the innings. Deliberately quiet and last — it's a correction, not
          a normal step — and it stops being offered once the second innings has
          a ball in it (the server refuses, and we say why). */}
      {!!onResumeFirst && (
        <TouchableOpacity
          style={s.undoRow}
          activeOpacity={0.7}
          disabled={undoing}
          onPress={async () => {
            setUndoing(true);
            const r = await onResumeFirst();
            setUndoing(false);
            if (!r?.ok) {
              Alert.alert("Can't resume the first innings", r?.error || 'Please try again.');
            }
          }}>
          {undoing
            ? <ActivityIndicator size="small" color={DS.textMuted} />
            : <Icon name="undo-variant" size={15} color={DS.textMuted} />}
          <Text style={s.undoTxt}>Ended by mistake? Resume the 1st innings</Text>
        </TouchableOpacity>
      )}

      {/* Who scores the second innings */}
      <View style={s.actions}>
        <TouchableOpacity style={[C.btnGhost, s.action]} onPress={openPicker} activeOpacity={0.85}>
          <Icon name="account-switch" size={18} color={CONTROL.green} />
          <Text style={C.btnGhostText}>Hand over scoring</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[C.btnPrimary, s.action]} onPress={() => { haptic.impact(); onContinue?.(); }} activeOpacity={0.85}>
          <Icon name="play-circle" size={18} color={CONTROL.onGreen} />
          <Text style={C.btnPrimaryText}>Continue scoring</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={picking} transparent animationType="slide" onRequestClose={() => setPicking(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Hand scoring to</Text>
            <Text style={s.sheetSub}>
              They take the book from here. You'll still see the match, but you won't be able to score it.
            </Text>

            {loading ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color={CONTROL.green} />
            ) : (
              <ScrollView style={{ maxHeight: 380 }}>
                {!!error && <Text style={s.error}>{error}</Text>}
                {opponents.length > 0 && (
                  <>
                    <Text style={s.group}>{opponents[0].teamName || 'OPPONENT'}</Text>
                    {opponents.map((c) => <Row key={c.userId} c={c} />)}
                  </>
                )}
                {others.length > 0 && (
                  <>
                    <Text style={s.group}>{others[0].teamName || 'THIS SIDE'}</Text>
                    {others.map((c) => <Row key={c.userId} c={c} />)}
                  </>
                )}
                {!loading && !error && opponents.length === 0 && others.length === 0 && (
                  <Text style={s.empty}>
                    Nobody in either squad has a Local Legends account yet, so there's no one to hand the book to.
                  </Text>
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={s.cancel} onPress={() => setPicking(false)}>
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (DS) => {
  const CONTROL = controlColors(DS);
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },
  content: { padding: 16, paddingTop: 52, gap: 12, paddingBottom: 24 },

  badge: {
    alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CONTROL.greenSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  badgeTxt: { fontSize: 11, fontWeight: '900', color: CONTROL.green, letterSpacing: 1 },

  scoreCard: { alignItems: 'center', paddingVertical: 8, gap: 2 },
  teamLine: { fontSize: 15, fontWeight: '800', color: DS.textVariant },
  score: { fontSize: 44, fontWeight: '900', color: DS.textPrimary, letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  oversLine: { fontSize: 13, fontWeight: '700', color: DS.textMuted, fontVariant: ['tabular-nums'] },
  reason: { fontSize: 12, fontWeight: '600', color: DS.textMuted, marginTop: 2, fontStyle: 'italic' },

  targetCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: CONTROL.green, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16,
  },
  targetTxt: { fontSize: 14, fontWeight: '700', color: CONTROL.onGreen, flexShrink: 1 },
  targetNum: { fontSize: 17, fontWeight: '900' },

  figureRow: { flexDirection: 'row', gap: 8 },
  figure: { flex: 1, gap: 2 },
  figureVal: { fontSize: 19, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  figureLbl: { fontSize: 11.5, fontWeight: '700', color: DS.textPrimary },
  figureSub: { fontSize: 10, fontWeight: '600', color: DS.textMuted, fontVariant: ['tabular-nums'] },

  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailTxt: { fontSize: 12.5, fontWeight: '600', color: DS.textVariant, flexShrink: 1 },

  undoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  undoTxt: { fontSize: 12.5, fontWeight: '700', color: DS.textMuted },
  actions: {
    flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: DS.border, backgroundColor: DS.bg,
  },
  action: { flex: 1 },

  overlay: { flex: 1, backgroundColor: DS.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: DS.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, gap: 4 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: DS.surfaceHighest, marginBottom: 10 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: DS.textPrimary },
  sheetSub: { fontSize: 12.5, fontWeight: '600', color: DS.textMuted, lineHeight: 18, marginBottom: 8 },
  group: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.7, marginTop: 12, marginBottom: 4, textTransform: 'uppercase' },

  candidate: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  candidateAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: DS.surfaceHigh },
  candidateAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  candidateInitial: { fontSize: 15, fontWeight: '900', color: CONTROL.green },
  candidateName: { fontSize: 14.5, fontWeight: '700', color: DS.textPrimary },
  candidateTeam: { fontSize: 11.5, fontWeight: '600', color: DS.textMuted, marginTop: 1 },

  error: { fontSize: 12.5, fontWeight: '700', color: DS.live, paddingVertical: 10 },
  empty: { fontSize: 12.5, fontWeight: '600', color: DS.textMuted, lineHeight: 19, paddingVertical: 18 },
  cancel: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  cancelTxt: { fontSize: 14, fontWeight: '800', color: DS.textMuted },
  });
};
