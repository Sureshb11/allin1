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

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import WagonWheel, { HandBadge } from './WagonWheel';
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

  // A fresh delivery is a fresh question, so this resets — otherwise the sheet
  // would reopen still showing the previous ball's answer and a scorer tapping
  // "Done" out of habit would file the last ball's shot against this one.
  //
  // Reopening the SAME delivery to correct it is the opposite case: it restores
  // what was recorded, so the scorer can see what they are changing instead of
  // being handed a blank wheel and asked to remember.
  useEffect(() => { if (visible) setPicked(initialShot || null); }, [visible, ball?.clientEventId]);

  const isDot = !ball?.isWicket && !ball?.runs;
  // After a dot the full twenty-shot list is noise — a dot is nearly always one
  // of four things, and offering four keeps the scorer's eyes on the game.
  const groups = isDot
    ? [{ title: 'What happened?', keys: DOT_BALL_TYPES }]
    : SHOT_GROUPS;

  const pickZone = (shot) => {
    haptic.tick();
    setPicked(shot);
    onCapture?.(shot);                    // sent NOW, not on Done
  };

  const pickType = (shotType) => {
    haptic.tick();
    const next = { ...picked, shotType };
    setPicked(next);
    onCapture?.(next);                    // upserts onto the same delivery
  };

  const pickConnection = (connectionType) => {
    haptic.tick();
    const next = { ...picked, connectionType };
    setPicked(next);
    onCapture?.(next);
  };

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Backdrop closes. Deliberately: the fastest way out of an optional
          question should be tapping anywhere that is not the question. */}
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>

          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.outcome}>{outcomeOf(ball)}</Text>
              <Text style={s.sub} numberOfLines={1}>
                {picked ? `${zoneLabel(picked.zone)?.toUpperCase() || ''}` : 'WHERE DID IT GO?'}
                {batterName ? ` · ${batterName}` : ''}
              </Text>
            </View>
            {/* Skip is a first-class control, not hidden — the feature is optional
                and the UI should keep saying so. */}
            <TouchableOpacity onPress={onClose} style={s.skip} accessibilityRole="button" accessibilityLabel="Skip shot capture">
              <Text style={s.skipText}>{picked ? 'DONE' : 'SKIP'}</Text>
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

          {/* The shot type only appears once the zone is answered. Showing both at
              once doubles the reading before the first tap, and the zone is the
              half that a wagon wheel cannot be drawn without. */}
          {picked ? (
            <ScrollView style={s.typeScroll} showsVerticalScrollIndicator={false}>
              {groups.map((g) => (
                <View key={g.title} style={s.group}>
                  <Text style={s.groupTitle}>{g.title.toUpperCase()}</Text>
                  <View style={s.chipWrap}>
                    {g.keys.map((k) => {
                      const on = picked.shotType === k;
                      return (
                        <TouchableOpacity key={k} onPress={() => pickType(k)}
                          style={[s.chip, on && s.chipOn]} accessibilityRole="button">
                          <Text style={[s.chipText, on && s.chipTextOn]}>{SHOT_LABELS[k]}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
              <View style={s.group}>
                <Text style={s.groupTitle}>CONNECTION</Text>
                <View style={s.chipWrap}>
                  {CONNECTIONS.map((cn) => {
                    const on = picked.connectionType === cn.key;
                    return (
                      <TouchableOpacity key={cn.key} onPress={() => pickConnection(cn.key)}
                        style={[s.chip, on && s.chipOn]} accessibilityRole="button">
                        <Text style={[s.chipText, on && s.chipTextOn]}>{cn.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          ) : (
            <View style={s.hintRow}>
              <Icon name="gesture-tap" size={14} color={c.textMuted} />
              <Text style={s.hint}>Tap the wheel — one tap records direction and distance</Text>
            </View>
          )}

        </Pressable>
      </Pressable>
    </Modal>
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
  typeScroll: { marginTop: 12 },
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
});
