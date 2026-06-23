import { useTheme, useThemedStyles } from "../theme/ThemeContext"; // SplashScreen — branded launch screen shown while the app restores the saved
// session (App.js `!ready`). Replaces the blank dark flash with the Local Legends
// logo mark + wordmark and a subtle pulsing "loading" cue. Pure JS, no assets.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';



export default function SplashScreen() {const C = useTheme().colors;const s = useThemedStyles(makeS);
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(a, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }).start();
  }, [a]);

  const style = {
    opacity: a,
    transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }]
  };

  return (
    <View style={s.root}>
      <Animated.View style={[s.row, style]}>
        <View style={s.logoBox}><Icon name="star-four-points" size={20} color={C.bg} /></View>
        <Text style={s.local}>LOCAL</Text>
        <View style={s.badge}><Text style={s.badgeTxt}>LEGENDS</Text></View>
      </Animated.View>
      <ActivityIndicator color={C.lime} style={{ marginTop: 28 }} />
    </View>);

}

const makeS = (C) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBox: { width: 40, height: 40, borderRadius: 11, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' },
  local: { fontSize: 22, fontWeight: '900', color: C.ink, letterSpacing: 2.5 },
  badge: { backgroundColor: C.lime, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 3 },
  badgeTxt: { fontSize: 16, fontWeight: '900', color: C.bg, letterSpacing: 1.5 }
});