import { useTheme, useThemedStyles } from "../theme/ThemeContext"; // Toast — branded, non-blocking in-app notifications to replace OS Alert popups.
// Mount <ToastHost/> once at the app root; call showToast(message, type?) from
// anywhere (no context/props needed). Types: 'success' | 'error' | 'info'.
//
//   import { showToast } from '../components/Toast';
//   showToast('OTP sent · code 1234', 'success');

import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Animated, Easing, TouchableOpacity, PanResponder, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';


const KIND = {
  success: { color: '#abd600', icon: 'check-circle' },
  error: { color: '#f87171', icon: 'alert-circle' },
  info: { color: '#60a5fa', icon: 'information' }
};

// Tiny module-level pub/sub so any module can fire a toast without a provider tree.
let listener = null;
let seq = 0;
export function showToast(message, type = 'info', duration = 2600) {
  listener?.({ id: ++seq, message, type, duration });
}

export function ToastHost() {const s = useThemedStyles(makeS);
  const [toast, setToast] = useState(null);
  const a = useRef(new Animated.Value(0)).current;
  const pan = useRef(new Animated.ValueXY()).current;
  const timer = useRef(null);

  const hide = () => {
    Animated.timing(a, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: false }).
    start(() => setToast(null));
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy < 0) { // Only allow swiping up
          pan.y.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -20) {
          hide();
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      }
    })
  ).current;

  useEffect(() => {
    listener = (t) => {
      clearTimeout(timer.current);
      setToast(t);
      a.setValue(0);
      pan.setValue({ x: 0, y: 0 });
      Animated.spring(a, { toValue: 1, friction: 7, tension: 70, useNativeDriver: false }).start();
      timer.current = setTimeout(hide, t.duration);
    };
    return () => {listener = null;clearTimeout(timer.current);};
  }, [a, pan]);

  if (!toast) return null;
  const k = KIND[toast.type] || KIND.info;
  const style = {
    opacity: a,
    transform: [
      { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) },
      { translateY: pan.y }
    ]
  };

  return (
    <Animated.View pointerEvents="box-none" style={[s.wrap, style]} {...panResponder.panHandlers}>
      <TouchableOpacity activeOpacity={0.9} onPress={hide} style={[s.card, { borderColor: k.color + '33' }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: k.color + '1A', borderRadius: 20 }]} />
        <Icon name={k.icon} size={20} color={k.color} />
        <Text style={s.msg} numberOfLines={2}>{toast.message}</Text>
      </TouchableOpacity>
    </Animated.View>);

}

const makeS = (C) => StyleSheet.create({
  wrap: { position: 'absolute', top: 54, left: 16, right: 16, zIndex: 9999, alignItems: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.surface, borderRadius: 20, paddingVertical: 13, paddingHorizontal: 16,
    borderWidth: 1, maxWidth: 520, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 12
  },
  msg: { flex: 1, color: C.ink, fontSize: 14, fontWeight: '600', lineHeight: 19 }
});