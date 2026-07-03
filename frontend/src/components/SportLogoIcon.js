// SportLogoIcon — frame-sequence logo animation for the Arena picker discs.
// Every sport's designer video (ProRes 4444 w/ alpha) was distilled to 30
// white-on-transparent PNG frames (assets/arenaAnim/<id>/), recoloured at
// render via `tintColor` so the scene takes the disc state: accent glyph at
// rest, dark glyph on the focused solid disc. Pure RN — no video dependency.
//
// Anti-flicker: when active we mount ALL frames stacked and switch which one
// is opaque, rather than swapping a single <Image>'s source. Swapping source
// showed a blank gap while the next frame decoded from the bundle — that read
// as a "shake" on the first loop (fine on the second, once cached). Keeping the
// previous frame visible underneath until the next is painted removes the gap.
//
//   <SportLogoIcon id="tennis" size={54} color={accent} active={focused} />

import { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import FRAMES from './arenaAnimFrames';

const FRAME_MS = 80;   // ~12fps playback
const HOLD_TICKS = 6;  // beat on the finished logo before the loop restarts
const START = 1;       // skip the (often blank) first frame so restarts don't flicker

export const hasSportAnim = (id) => Boolean(FRAMES[id]);

export default function SportLogoIcon({ id, size = 54, color = '#c4f82a', active = false }) {
  const frames = FRAMES[id];
  const last = frames.length - 1;
  const [frame, setFrame] = useState(last);   // rest on the finished logo
  const tick = useRef(START);

  useEffect(() => {
    if (!active) { setFrame(last); return; }
    tick.current = START;
    const timer = setInterval(() => {
      const t = tick.current;
      setFrame(t <= last ? t : last);
      tick.current = t >= last + HOLD_TICKS ? START : t + 1;
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [active, id, last]);

  const dim = { width: size, height: size };

  // At rest: a single static Image of the finished logo (cheap for the 18
  // unfocused discs). When focused: stack every frame, reveal one by opacity.
  if (!active) {
    return <Image source={frames[last]} style={dim} tintColor={color} resizeMode="contain" fadeDuration={0} />;
  }

  return (
    <View style={dim}>
      {frames.map((src, i) => (
        <Image
          key={i}
          source={src}
          style={[StyleSheet.absoluteFill, { opacity: i === frame ? 1 : 0 }]}
          tintColor={color}
          resizeMode="contain"
          fadeDuration={0}
        />
      ))}
    </View>
  );
}
