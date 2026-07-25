import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';

// Compact segmented toggle with a sliding thumb — the app's standard for a LOCAL
// view-mode switch (Batting/Bowling, Players/Teams). Deliberately distinct from
// the underline tab bars: underline = a swipeable navigation level, capsule =
// a tap toggle. Giving the two different shapes is what teaches the gesture.
export default function SegmentedControl({ options, value, onChange, style }) {
  const { colors: DS } = useTheme();
  const [trackW, setTrackW] = useState(0);            // inner width (minus padding)
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  const x = useRef(new Animated.Value(0)).current;
  const segW = trackW / options.length;

  useEffect(() => {
    if (!trackW) return;
    Animated.spring(x, {
      toValue: idx * segW,
      useNativeDriver: true,
      stiffness: 260, damping: 26, mass: 0.9,
    }).start();
  }, [idx, segW, trackW, x]);

  return (
    <View
      style={[s.track, { backgroundColor: DS.surfaceLow }, style]}
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width - 6)}
    >
      {trackW > 0 && (
        <Animated.View style={[s.thumb, { width: segW, backgroundColor: DS.lime, transform: [{ translateX: x }] }]} />
      )}
      {options.map((o) => {
        const on = o.id === value;
        return (
          <TouchableOpacity key={o.id} style={s.seg} activeOpacity={0.8}
            onPress={() => { if (o.id !== value) onChange(o.id); }}>
            {o.icon ? <Icon name={o.icon} size={14} color={on ? DS.bg : DS.textMuted} /> : null}
            <Text style={[s.txt, { color: on ? DS.bg : DS.textMuted }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  thumb: { position: 'absolute', top: 3, bottom: 3, left: 3, borderRadius: 9 },
  seg: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8 },
  txt: { fontSize: 12.5, fontWeight: '700' },
});
