import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { pav } from '../theme/pavilion';

// Compact segmented toggle with a near-black sliding thumb on a charcoal track —
// the app's standard for a LOCAL view-mode switch (Batting/Bowling,
// Players/Teams). Distinct from the L1 pill nav (which is swipeable) by size and
// context, not shape: both use the "charcoal + lime" language so the screen reads
// as one system. Active label is bright cricket-green on the black thumb.
export default function SegmentedControl({ options, value, onChange, style }) {
  const { colors: DS } = useTheme();
  const P = pav(DS);
  const [trackW, setTrackW] = useState(0);            // inner width (minus padding)
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  const segW = trackW / options.length;
  const x = useSharedValue(0);

  useEffect(() => {
    if (!trackW) return;
    x.value = withSpring(idx * segW, { stiffness: 260, damping: 26, mass: 0.9 });
  }, [idx, segW, trackW, x]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      style={[s.track, { backgroundColor: P.track }, style]}
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width - 8)}
    >
      {trackW > 0 && (
        <Animated.View style={[s.thumb, { width: segW, backgroundColor: P.control }, thumbStyle]} />
      )}
      {options.map((o) => {
        const on = o.id === value;
        const fg = on ? P.accent : P.textOff;
        return (
          <TouchableOpacity key={o.id} style={s.seg} activeOpacity={0.8}
            onPress={() => { if (o.id !== value) onChange(o.id); }}>
            {o.icon ? <Icon name={o.icon} size={14} color={fg} /> : null}
            <Text style={[s.txt, { color: fg }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 13, padding: 4 },
  thumb: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 10 },
  seg: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9 },
  txt: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.2 },
});
