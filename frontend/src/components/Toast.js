// Toast — branded, non-blocking in-app notifications to replace OS Alert popups.
// Mount <ToastHost/> once at the app root; call showToast(message, type?) from
// anywhere (no context/props needed). Types: 'success' | 'error' | 'info'.
//
//   import { showToast } from '../components/Toast';
//   showToast('OTP sent · code 1234', 'success');

import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const C = { bg: '#1a2138', ink: '#eef1fb', sub: '#aeb6cc' };
const KIND = {
  success: { color: '#abd600', icon: 'check-circle' },
  error:   { color: '#f87171', icon: 'alert-circle' },
  info:    { color: '#60a5fa', icon: 'information' },
};

// Tiny module-level pub/sub so any module can fire a toast without a provider tree.
let listener = null;
let seq = 0;
export function showToast(message, type = 'info', duration = 2600) {
  listener?.({ id: ++seq, message, type, duration });
}

export function ToastHost() {
  const [toast, setToast] = useState(null);
  const a = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const hide = () => {
    Animated.timing(a, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true })
      .start(() => setToast(null));
  };

  useEffect(() => {
    listener = (t) => {
      clearTimeout(timer.current);
      setToast(t);
      a.setValue(0);
      Animated.spring(a, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, t.duration);
    };
    return () => { listener = null; clearTimeout(timer.current); };
  }, [a]);

  if (!toast) return null;
  const k = KIND[toast.type] || KIND.info;
  const style = {
    opacity: a,
    transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
  };

  return (
    <Animated.View pointerEvents="box-none" style={[s.wrap, style]}>
      <TouchableOpacity activeOpacity={0.9} onPress={hide} style={[s.card, { borderLeftColor: k.color }]}>
        <Icon name={k.icon} size={20} color={k.color} />
        <Text style={s.msg} numberOfLines={2}>{toast.message}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', top: 54, left: 16, right: 16, zIndex: 9999, alignItems: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.bg, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16,
    borderLeftWidth: 4, maxWidth: 520, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 12,
  },
  msg: { flex: 1, color: C.ink, fontSize: 14, fontWeight: '600', lineHeight: 19 },
});
