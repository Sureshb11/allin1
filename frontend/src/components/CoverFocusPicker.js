import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, PanResponder, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

// Choose which part of a wide cover stays visible when it is cropped short.
//
// The direct manipulation is the point: drag the picture, watch the card-shaped
// window, stop when the right thing is in it. A pair of X/Y sliders would be
// the same data and none of the understanding — nobody thinks about their
// photo in percentages.
//
// The window is drawn at the aspect ratio the card actually uses, so what is
// framed here is what ships. Dragging moves the IMAGE under a fixed window,
// which is why the maths inverts the delta: pulling the picture up reveals what
// was below it, so the focal point moves down.
const CARD_ASPECT = 320 / 80;   // the list card's cover box

export default function CoverFocusPicker({ uri, focus, onChange, height = 110 }) {
  const DS = useTheme().colors;
  const s = useThemedStyles(makeStyles);
  const [nat, setNat] = useState(null);
  const [box, setBox] = useState(null);
  // The gesture needs the value without re-creating the responder on each move.
  const value = useRef({ x: focus?.x ?? 0.5, y: focus?.y ?? 0.5 });
  const start = useRef(value.current);
  const [, force] = useState(0);

  useEffect(() => { value.current = { x: focus?.x ?? 0.5, y: focus?.y ?? 0.5 }; }, [focus?.x, focus?.y]);

  useEffect(() => {
    if (!uri) return undefined;
    let alive = true;
    Image.getSize(uri, (w, h) => { if (alive) setNat({ w, h }); }, () => {});
    return () => { alive = false; };
  }, [uri]);

  const geom = (() => {
    if (!box || !nat?.w || !nat?.h) return null;
    const scale = Math.max(box.w / nat.w, box.h / nat.h);
    const w = nat.w * scale, h = nat.h * scale;
    return { w, h, overX: Math.max(0, w - box.w), overY: Math.max(0, h - box.h) };
  })();

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = value.current; },
    onPanResponderMove: (_, g) => {
      const G = geomRef.current;
      if (!G) return;
      // Only the axis with overflow can move; a cover that exactly fits one
      // dimension has nothing to reveal along it.
      const nx = G.overX > 0 ? start.current.x - g.dx / G.overX : start.current.x;
      const ny = G.overY > 0 ? start.current.y - g.dy / G.overY : start.current.y;
      const next = { x: clamp(nx), y: clamp(ny) };
      value.current = next;
      force((n) => n + 1);
    },
    onPanResponderRelease: () => onChange?.(value.current),
    onPanResponderTerminate: () => onChange?.(value.current),
  })).current;

  // The responder closes over its creation-time scope, so the current geometry
  // reaches it through a ref rather than by rebuilding the responder.
  const geomRef = useRef(null);
  geomRef.current = geom;

  if (!uri) return null;
  const v = value.current;

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={s.head}>
        <Text style={s.label}>Cover focus</Text>
        <TouchableOpacity
          onPress={() => { value.current = { x: 0.5, y: 0.5 }; onChange?.(value.current); force((n) => n + 1); }}
          hitSlop={8} style={s.reset}>
          <Icon name="image-filter-center-focus" size={13} color={DS.lime} />
          <Text style={s.resetText}>Centre</Text>
        </TouchableOpacity>
      </View>

      <View
        style={[s.window, { height }]}
        onLayout={(e) => {
          const { width, height: hh } = e.nativeEvent.layout;
          setBox((b) => (b && b.w === width && b.h === hh ? b : { w: width, h: hh }));
        }}
        {...pan.panHandlers}>
        {geom ? (
          <Image
            source={{ uri }}
            style={{
              position: 'absolute', width: geom.w, height: geom.h,
              left: -geom.overX * v.x, top: -geom.overY * v.y,
            }}
            resizeMode="stretch"
          />
        ) : (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )}
        {/* The card's real proportions, drawn over the picture, so the framing
            decision is made against the shape it will actually be cropped to. */}
        <View pointerEvents="none" style={s.guideWrap}>
          <View style={[s.guide, { aspectRatio: CARD_ASPECT }]} />
        </View>
        <View pointerEvents="none" style={s.hint}>
          <Icon name="cursor-move" size={12} color="#fff" />
          <Text style={s.hintText}>Drag to reposition</Text>
        </View>
      </View>
      <Text style={s.note}>
        This is how the cover is cropped on the tournament list and at the top of the tournament.
      </Text>
    </View>
  );
}

const clamp = (n) => Math.min(1, Math.max(0, n));

const makeStyles = (DS) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.7, textTransform: 'uppercase' },
  reset: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resetText: { fontSize: 11.5, fontWeight: '800', color: DS.lime },
  window: {
    borderRadius: 14, overflow: 'hidden', backgroundColor: DS.surfaceHigh,
    borderWidth: 1.5, borderColor: DS.lime,
  },
  guideWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  guide: { width: '92%', borderWidth: 1.5, borderColor: '#ffffffcc', borderRadius: 6 },
  hint: {
    position: 'absolute', bottom: 6, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#00000099', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  hintText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  note: { fontSize: 11, fontWeight: '600', color: DS.textMuted, marginTop: 6 },
});
