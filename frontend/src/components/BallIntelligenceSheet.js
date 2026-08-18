// "Where did it go?" — the whole of the scorer's extra work.
//
// The single design constraint: the scorer is standing at a ground with the next
// ball about to be bowled. The delivery is ALREADY saved and the score is ALREADY
// on the board before this ever opens — so every interaction here is optional and
// closing it at any moment loses nothing that was not already recorded.
//
// The flow is one tap, then optionally one more:
//
//   tap the wheel  →  zone + angle + distance captured AND SENT
//                  →  sheet swaps to a shot-type row
//   tap a type     →  sent as an update to the same record
//   Done / backdrop→  closed
//
// The send happens on the FIRST tap rather than on Done, so a scorer who taps the
// wheel and immediately turns back to the game has still recorded a shot. Nothing
// waits for a second confirmation that a busy scorer will never give.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import WagonWheel, { HandBadge } from './WagonWheel';
import BatsmanAvatar from './BatsmanAvatar';
import { SHOT_GROUPS, SHOT_LABELS, DOT_BALL_TYPES, CONNECTIONS, zoneLabel } from '../sports/cricket/wagonWheel';
import haptic from '../utils/haptics';

/** The headline: what the delivery actually produced. */
const outcomeOf = (ball) => {
  if (!ball) return '';
  if (ball.isWicket) return 'WICKET';
  if (ball.extraType === 'wide') return 'WIDE';
  if (ball.extraType === 'noBall') return 'NO BALL';
  if (ball.runs === 6) return 'SIX';
  if (ball.runs === 4) return 'FOUR';
  if (ball.runs === 0) return 'DOT BALL';
  return `${ball.runs} RUN${ball.runs !== 1 ? 'S' : ''}`;
};

export default function BallIntelligenceSheet({
  visible,
  ball,            // { runs, isWicket, extraType } — the delivery just scored
  batterName,
  hand = 'right',
  // What is already recorded for THIS delivery, when reopened to be corrected.
  // Absent for a delivery being asked about for the first time.
  initialShot = null,
  onCapture,       // ({ angle, distance, zone, shotType, connectionType }) => void
  onClose,
}) {
  const c = useTheme().colors;
  const s = useMemo(() => makeStyles(c), [c]);
  const [picked, setPicked] = useState(null);   // the zone tap, once made
  const closeTimer = useRef(null);

  // TWO POPUPS, one after the other — not one sheet that grows.
  //
  //   'zone'  the wagon wheel. Tapping it CLOSES this and opens the next.
  //   'shot'  the strokes, as batsmen. Tapping one closes everything.
  //
  // Rendered as two separate Modals with mutually exclusive visibility, so each
  // step genuinely dismisses before the next appears. One sheet that swapped its
  // contents left the wheel on screen under a growing list, which is a different
  // thing to look at and a slower one to read.
  const [step, setStep] = useState('zone');

  // A pending auto-close must never fire into a sheet that has moved on — it
  // would shut the NEXT delivery's question before the scorer had answered it.
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => { clearTimeout(closeTimer.current); }, [ball?.clientEventId]);

  // A fresh delivery is a fresh question, so this resets — otherwise the sheet
  // would reopen still showing the previous ball's answer and a scorer tapping
  // "Done" out of habit would file the last ball's shot against this one.
  //
  // Reopening the SAME delivery to correct it is the opposite case: it restores
  // what was recorded, so the scorer can see what they are changing instead of
  // being handed a blank wheel and asked to remember.
  useEffect(() => {
    if (!visible) return;
    setPicked(initialShot || null);
    // Reopening a delivery that already has a zone goes straight to the strokes:
    // the scorer came back to name the shot, not to answer the wheel again.
    setStep(initialShot?.zone ? 'shot' : 'zone');
  }, [visible, ball?.clientEventId]);

  const isDot = !ball?.isWicket && !ball?.runs;
  // After a dot the full twenty-shot list is noise — a dot is nearly always one
  // of four things, and offering four keeps the scorer's eyes on the game.
  const groups = isDot
    ? [{ title: 'What happened?', keys: DOT_BALL_TYPES }]
    : SHOT_GROUPS;

  // The zone is stored the instant it is tapped, BEFORE the second popup opens.
  // So a scorer who answers the wheel and then dismisses the shot picker has
  // still recorded where the ball went — the second question is genuinely
  // optional, and nothing waits on it.
  const pickZone = (shot) => {
    haptic.tick();
    setPicked(shot);
    onCapture?.(shot);
    setStep('shot');                      // wheel closes, strokes open
  };

  // Picking a shot ENDS the interaction. The scorer asked for two taps and this
  // is the second one, so the sheet gets out of the way by itself rather than
  // making them find a Done button with the next ball already being walked back
  // to the mark.
  //
  // The short delay is not decoration: closing on the same frame as the tap
  // gives no confirmation that the right tile was hit, and a scorer who is not
  // sure will reopen to check. ~260ms is long enough to see the tile light up
  // and short enough not to feel like waiting.
  const pickType = (shotType) => {
    haptic.tick();
    const next = { ...picked, shotType };
    setPicked(next);
    onCapture?.(next);                    // upserts onto the same delivery
    closeTimer.current = setTimeout(() => onClose?.(), 260);
  };

  const pickConnection = (connectionType) => {
    haptic.tick();
    const next = { ...picked, connectionType };
    setPicked(next);
    onCapture?.(next);
  };

  return (
    <>
      {/* ── STEP 1 · WHERE DID IT GO ────────────────────────────────────────
          Just the wheel. Tapping it stores the zone and dismisses this popup
          entirely, which is what makes the next one feel like a step forward
          rather than a list unfolding underneath. */}
      <Modal
        visible={!!visible && step === 'zone'}
        transparent animationType="fade" onRequestClose={onClose}
      >
        {/* Backdrop closes. The fastest way out of an optional question should
            be tapping anywhere that is not the question. */}
        <Pressable style={s.backdrop} onPress={onClose}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.head}>
              <View style={{ flex: 1 }}>
                <Text style={s.outcome}>{outcomeOf(ball)}</Text>
                <Text style={s.sub} numberOfLines={1}>
                  WHERE DID IT GO?{batterName ? ` \u00b7 ${batterName}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={s.skip}
                accessibilityRole="button" accessibilityLabel="Skip shot capture">
                <Text style={s.skipText}>SKIP</Text>
              </TouchableOpacity>
            </View>

            <View style={s.wheelWrap}>
              <WagonWheel
                size={260}
                hand={hand}
                mode="capture"
                selectedZone={picked?.zone || null}
                picked={picked}
                onPick={pickZone}
              />
            </View>
            <HandBadge hand={hand} />

            <View style={s.hintRow}>
              <Icon name="gesture-tap" size={14} color={c.textMuted} />
              <Text style={s.hint}>Tap the wheel — one tap records direction and distance</Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── STEP 2 · WHICH SHOT ─────────────────────────────────────────────
          Batsmen, not words. The zone is ALREADY SAVED by the time this opens,
          so dismissing it costs nothing — this question is genuinely optional
          and the header says so. */}
      <Modal
        visible={!!visible && step === 'shot'}
        transparent animationType="fade" onRequestClose={onClose}
      >
        <Pressable style={s.backdrop} onPress={onClose}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.head}>
              <View style={{ flex: 1 }}>
                <Text style={s.outcome}>WHICH SHOT?</Text>
                <Text style={s.sub} numberOfLines={1}>
                  {zoneLabel(picked?.zone)?.toUpperCase() || ''} SAVED
                  {batterName ? ` \u00b7 ${batterName}` : ''}
                </Text>
              </View>
              {/* Back, not just Skip: a scorer who realises they hit the wrong
                  wedge should not have to close and rescore to fix it. */}
              <TouchableOpacity onPress={() => setStep('zone')} style={s.skip}
                accessibilityRole="button" accessibilityLabel="Back to the wagon wheel">
                <Icon name="chevron-left" size={16} color={c.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={s.skip}
                accessibilityRole="button" accessibilityLabel="Done without naming the shot">
                <Text style={s.skipText}>DONE</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={s.typeScroll}
              contentContainerStyle={s.typeScrollBody}
              showsVerticalScrollIndicator
            >
              {/* Connection first: picking a shot closes the popup, so anything
                  offered after it would be unreachable. */}
              <View style={s.group}>
                <Text style={s.groupTitle}>CONNECTION - OPTIONAL</Text>
                <View style={s.chipWrap}>
                  {CONNECTIONS.map((cn) => {
                    const on = picked?.connectionType === cn.key;
                    return (
                      <TouchableOpacity key={cn.key} onPress={() => pickConnection(cn.key)}
                        style={[s.chip, on && s.chipOn]} accessibilityRole="button"
                        accessibilityState={{ selected: on }}>
                        <Text style={[s.chipText, on && s.chipTextOn]}>{cn.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {groups.map((g) => (
                <View key={g.title} style={s.group}>
                  <Text style={s.groupTitle}>{g.title.toUpperCase()}</Text>
                  <View style={s.tileWrap}>
                    {g.keys.map((k) => {
                      const on = picked?.shotType === k;
                      return (
                        <TouchableOpacity key={k} onPress={() => pickType(k)}
                          style={[s.tile, on && s.tileOn]}
                          accessibilityRole="button"
                          accessibilityLabel={SHOT_LABELS[k]}
                          accessibilityState={{ selected: on }}>
                          <BatsmanAvatar
                            shotKey={k}
                            hand={hand}
                            size={58}
                            color={on ? c.bg : c.textPrimary}
                            accent={on ? c.bg : c.lime}
                            ground={on ? c.bg : c.surfaceHighest}
                          />
                          <Text style={[s.tileText, on && s.tileTextOn]} numberOfLines={2}>
                            {SHOT_LABELS[k]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (c) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 22, maxHeight: '92%',
    borderTopWidth: 1, borderColor: c.surfaceHighest,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  outcome: { color: c.lime, fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  sub: { color: c.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 2 },
  skip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
    backgroundColor: c.surfaceHigh, borderWidth: 1, borderColor: c.surfaceHighest,
  },
  skipText: { color: c.textPrimary, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  wheelWrap: { alignItems: 'center', marginVertical: 6 },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
  hint: { color: c.textMuted, fontSize: 11, fontWeight: '600' },
  // flex:1 is load-bearing, not cosmetic. Without it the ScrollView sizes itself
  // to its own content, so its frame and its content are the same height —
  // nothing to scroll — and the sheet's maxHeight simply clips the overflow.
  // With 29 strokes that hid six of them behind an edge that would not move.
  typeScroll: { flex: 1, marginTop: 12 },
  typeScrollBody: { paddingBottom: 10 },
  group: { marginBottom: 12 },
  groupTitle: { color: c.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 7 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999,
    backgroundColor: c.surfaceHigh, borderWidth: 1, borderColor: c.surfaceHighest,
  },
  chipOn: { backgroundColor: c.lime, borderColor: c.lime },
  chipText: { color: c.textPrimary, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: c.bg, fontWeight: '900' },
  // Four across: big enough for a glyph to read at arm's length, small enough
  // that a whole group fits without scrolling.
  tileWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tile: {
    // Sized to the figure. The old 0.92 made a ~130dp box around a 46dp
    // silhouette, so most of every tile was empty and the list ran twice as
    // long as it needed to — which is also what pushed it past the fold.
    width: '31.5%', aspectRatio: 1.16, alignItems: 'center', justifyContent: 'center', gap: 2,
    paddingVertical: 6, paddingHorizontal: 2, borderRadius: 12,
    backgroundColor: c.surfaceHigh, borderWidth: 1, borderColor: c.surfaceHighest,
  },
  tileOn: { backgroundColor: c.lime, borderColor: c.lime },
  tileText: { color: c.textPrimary, fontSize: 10, fontWeight: '700', textAlign: 'center', lineHeight: 12 },
  tileTextOn: { color: c.bg, fontWeight: '900' },
});
