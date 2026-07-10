// PlayerAvatar — a small circular player avatar (photo, or initial fallback)
// that pops up an enlarged view when tapped. Used on the scorecard and the live
// scoring screen so a scorer can tap a face to see who's who at full size.
// Self-contained (owns its modal), so it drops in anywhere a name/avatar is shown.
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export default function PlayerAvatar({ name, avatarUrl, size = 26, style }) {
  const C = useTheme().colors;
  const [open, setOpen] = useState(false);
  const initial = (name || '?').charAt(0).toUpperCase();
  const r = size / 2;

  return (
    <>
      <TouchableOpacity activeOpacity={0.7} hitSlop={6} onPress={() => setOpen(true)} style={style}>
        {avatarUrl
          ? <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: r, backgroundColor: C.surfaceHighest }} />
          : <View style={{ width: size, height: size, borderRadius: r, backgroundColor: C.surfaceHighest, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: size * 0.42, fontWeight: '900', color: C.lime }}>{initial}</Text>
            </View>}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable style={[s.backdrop, { backgroundColor: C.overlay || 'rgba(0,0,0,0.85)' }]} onPress={() => setOpen(false)}>
          <View style={[s.card, { backgroundColor: C.bg, borderColor: C.line }]}>
            {avatarUrl
              ? <Image source={{ uri: avatarUrl }} style={s.bigImg} resizeMode="cover" />
              : <View style={[s.bigImg, s.bigInitial, { backgroundColor: C.surfaceHighest }]}>
                  <Text style={{ fontSize: 92, fontWeight: '900', color: C.lime }}>{initial}</Text>
                </View>}
            {!!name && <Text style={[s.name, { color: C.textPrimary }]} numberOfLines={1}>{name}</Text>}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: { borderRadius: 20, borderWidth: 1, padding: 14, alignItems: 'center', maxWidth: 320 },
  bigImg: { width: 240, height: 240, borderRadius: 16 },
  bigInitial: { alignItems: 'center', justifyContent: 'center' },
  name: { marginTop: 12, fontSize: 17, fontWeight: '800' },
});
