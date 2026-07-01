// MomentumMeter — the design system's signature live-match component.
// A thin horizontal bar showing which side currently holds the statistical
// advantage: lime (left/team A) meeting orange (right/team B). The split is
// driven by a 0..1 `value` (share belonging to the LEFT side).
//
//   <MomentumMeter value={0.62} leftLabel="MI" rightLabel="CSK" />
//
// If you only have two raw numbers (scores, run-rates…), pass them and let the
// component compute the share:  <MomentumMeter a={182} b={140} .../>

import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

export default function MomentumMeter({
  value,           // 0..1 share for the left side (optional if a/b given)
  a,               // raw left metric (optional)
  b,               // raw right metric (optional)
  leftLabel,
  rightLabel,
  height = 8,
  showLabels = true,
}) {
  const D = useTheme().colors;
  const s = useThemedStyles(makeStyles);

  // Resolve the left-share: explicit `value`, else a/(a+b), else even.
  let share = typeof value === 'number' ? value
    : (a != null && b != null && (a + b) > 0) ? a / (a + b)
    : 0.5;
  share = Math.max(0.04, Math.min(0.96, share));   // keep both ends visible

  const anim = useRef(new Animated.Value(share)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: share, friction: 7, tension: 60, useNativeDriver: false }).start();
  }, [share, anim]);

  const leftPct = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const lead = share >= 0.5 ? leftLabel : rightLabel;

  return (
    <View style={s.wrap}>
      {showLabels && (
        <View style={s.labelRow}>
          <Text style={[s.side, { color: D.lime }]} numberOfLines={1}>{leftLabel}</Text>
          <Text style={s.mid}>MOMENTUM{lead ? ` · ${lead}` : ''}</Text>
          <Text style={[s.side, { color: D.coral, textAlign: 'right' }]} numberOfLines={1}>{rightLabel}</Text>
        </View>
      )}
      <View style={[s.track, { height, borderRadius: height / 2, backgroundColor: D.coral }]}>
        <Animated.View style={[s.fill, { width: leftPct, borderRadius: height / 2, backgroundColor: D.lime }]} />
        {/* seam glow where the two sides meet */}
        <Animated.View style={[s.seam, { left: leftPct, height }]} />
      </View>
    </View>
  );
}

const makeStyles = (D) => StyleSheet.create({
  wrap: { width: '100%' },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  side: { flex: 1, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  mid: { flex: 1.4, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: D.textMuted, textAlign: 'center' },
  track: { width: '100%', overflow: 'hidden', flexDirection: 'row' },
  fill: { height: '100%' },
  seam: { position: 'absolute', width: 2, marginLeft: -1, backgroundColor: 'rgba(255,255,255,0.75)' },
});
