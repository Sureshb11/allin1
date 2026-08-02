import { useEffect, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';

// An image cropped to its container around a chosen point.
//
// `resizeMode: 'cover'` fills the box and crops the overflow from the CENTRE,
// with no way to say otherwise. A tournament cover is uploaded wide and drawn
// short — 80dp on a list card — so a poster with its title along the top, or a
// squad photo with the players along the bottom, loses the part worth showing
// and there is nothing the organiser can do about it.
//
// So: measure the container, ask the image its real size, scale it to cover,
// and slide it so the focal point sits where it should. focus is {x, y}, each
// 0..1 across the image; {0.5, 0.5} reproduces plain `cover` exactly, which is
// what every image without a stored focus gets.
export default function FocusedImage({ uri, focus, style, children }) {
  const [box, setBox] = useState(null);      // container size, from onLayout
  const [nat, setNat] = useState(null);      // intrinsic image size

  useEffect(() => {
    if (!uri) return undefined;
    let alive = true;
    Image.getSize(uri, (w, h) => { if (alive) setNat({ w, h }); }, () => {});
    return () => { alive = false; };
  }, [uri]);

  if (!uri) return <View style={style}>{children}</View>;

  const fx = Math.min(1, Math.max(0, focus?.x ?? 0.5));
  const fy = Math.min(1, Math.max(0, focus?.y ?? 0.5));

  let inner = null;
  if (box && nat && nat.w > 0 && nat.h > 0) {
    // Cover: the smaller dimension must still fill, so scale by the larger ratio.
    const scale = Math.max(box.w / nat.w, box.h / nat.h);
    const w = nat.w * scale;
    const h = nat.h * scale;
    // Slide by the overflow, weighted by where the focus sits.
    inner = { position: 'absolute', width: w, height: h, left: -(w - box.w) * fx, top: -(h - box.h) * fy };
  }

  return (
    <View
      style={[style, { overflow: 'hidden' }]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        // Only re-state on a real change — onLayout fires on every re-render.
        setBox((b) => (b && b.w === width && b.h === height ? b : { w: width, h: height }));
      }}>
      {inner
        ? <Image source={{ uri }} style={inner} resizeMode="stretch" />
        // Until both measurements land, plain cover: right in the common case
        // (a centred focus) and never blank.
        : <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
      {children}
    </View>
  );
}
