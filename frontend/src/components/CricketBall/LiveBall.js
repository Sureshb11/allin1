// ─────────────────────────────────────────────────────────────────────────────
// LiveBall — Phase 4/5 spectator companion (per the poster spec).
//
// Rendered by the live ScorecardScreen as a full-screen overlay: the dock has
// slid away (useDockLock) and only the signature ball remains, bottom-centre.
//
//   · reacts to match events (props.event = { type, id }): run pulse, FOUR
//     spin, SIX big spin, WICKET shake, over-complete bounce — plus a coloured
//     energy ripple (blue four / gold six / red wicket / green runs)
//   · tap → radial quick menu that jumps between the scorecard's tabs
//
// Reactions are deliberately quieter than the app's celebration overlays —
// the ball acknowledges the moment, the overlay celebrates it.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback,
  Animated, Easing, StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AnimatedCricketBall from './AnimatedBall';
import WicketBall from './WicketBall';
import haptic from '../../utils/haptics';

const EVENT_COLORS = {
  run:      '#3ecf6e',
  four:     '#00AEEF',
  six:      '#f5c968',
  wicket:   '#ff4d4d',
  over:     '#9be7ff',
  innings:  '#7de2ff',   // big cool ring as the sides swap
  finished: '#ffd873',   // golden trophy ring
};

export default function LiveBall({ event, menuItems = [], size = 56 }) {
  const ballRef = useRef(null);
  const [open, setOpen] = useState(false);
  const menuA  = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const [rippleColor, setRippleColor] = useState(EVENT_COLORS.run);
  // WICKET → the ball itself becomes the shatter clip (in place, no backdrop).
  // wicketKey both restarts the sequence and marks it as playing (null = idle).
  const [wicketKey, setWicketKey] = useState(null);

  // ── match reactions ──
  useEffect(() => {
    if (!event?.id) return;
    if (event.type === 'wicket') {
      // hand the moment to the inline clip; skip the ball's little shake + the
      // red ripple — the shatter animation carries its own drama.
      setWicketKey(event.id);
      return;
    }
    ballRef.current?.react(event.type);
    setRippleColor(EVENT_COLORS[event.type] || EVENT_COLORS.run);
    ripple.setValue(0);
    const big = event.type === 'six' || event.type === 'innings' || event.type === 'finished';
    Animated.timing(ripple, {
      toValue: 1, duration: big ? 1000 : 620,
      easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  const toggle = (to) => {
    setOpen(to);
    haptic.tick?.();
    Animated.spring(menuA, { toValue: to ? 1 : 0, speed: 16, bounciness: 7, useNativeDriver: true }).start();
  };

  const rippleScale   = ripple.interpolate({ inputRange: [0, 1], outputRange: [0.55, 2.3] });
  const rippleOpacity = ripple.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.85, 0] });

  // Radial arc: items fan out over the ball, 160°→20° (left to right), so
  // every button sits clearly above the ball with even spacing.
  const N = Math.max(menuItems.length, 1);
  const RADIUS = 128;
  const pos = (i) => {
    const deg = 160 - (N === 1 ? 70 : (i * (140 / (N - 1))));
    const rad = (deg * Math.PI) / 180;
    return { x: RADIUS * Math.cos(rad), y: -RADIUS * Math.sin(rad) - 18 };
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* dim backdrop while the menu is open */}
      {open && (
        <TouchableWithoutFeedback onPress={() => toggle(false)}>
          <Animated.View style={[styles.backdrop, { opacity: menuA }]} />
        </TouchableWithoutFeedback>
      )}

      <View style={styles.anchor} pointerEvents="box-none">
        {/* radial quick menu */}
        {menuItems.map((it, i) => {
          const { x, y } = pos(i);
          const tx = menuA.interpolate({ inputRange: [0, 1], outputRange: [0, x] });
          const ty = menuA.interpolate({ inputRange: [0, 1], outputRange: [0, y] });
          const sc = menuA.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.3, 0.9, 1] });
          return (
            <Animated.View key={it.key || i} pointerEvents={open ? 'auto' : 'none'}
              style={[styles.menuItem, {
                opacity: menuA,
                transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
              }]}>
              <TouchableOpacity style={styles.menuBtn} activeOpacity={0.85}
                accessibilityRole="button" accessibilityLabel={it.label}
                onPress={() => { toggle(false); it.onPress?.(); }}>
                <Icon name={it.icon} size={21} color="#eaf6ff" />
              </TouchableOpacity>
              <Text style={styles.menuLbl} numberOfLines={1}>{it.label}</Text>
            </Animated.View>
          );
        })}

        {/* event energy ripple, centred on the ball */}
        <Animated.View pointerEvents="none"
          style={[styles.ripple, {
            borderColor: rippleColor, opacity: rippleOpacity,
            transform: [{ scale: rippleScale }],
          }]} />

        {/* the companion itself — the shatter clip takes its place on a wicket,
            then hands back to the live ball when the sequence ends */}
        {wicketKey != null ? (
          <WicketBall size={size} playKey={wicketKey} onDone={() => setWicketKey(null)} />
        ) : (
          <AnimatedCricketBall ref={ballRef} size={size} spinOnTap={false}
            onPress={() => toggle(!open)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,7,14,0.72)' },
  anchor: { position: 'absolute', bottom: 26, alignSelf: 'center', alignItems: 'center' },
  ripple: {
    position: 'absolute', top: 2, alignSelf: 'center',
    width: 56, height: 56, borderRadius: 28, borderWidth: 2.5,
  },
  menuItem: { position: 'absolute', top: 6, alignSelf: 'center', alignItems: 'center', width: 64 },
  menuBtn: {
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(20,28,48,0.97)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  menuLbl: { marginTop: 4, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, color: '#d7e3f5' },
});
