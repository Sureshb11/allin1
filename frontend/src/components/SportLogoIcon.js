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
import { View, Image } from 'react-native';
import FRAMES from './arenaAnimFrames';

const FRAME_MS = 80;   // ~12fps playback
const HOLD_TICKS = 6;  // beat on the finished logo before the loop restarts

// These are logo *reveal* clips (the art draws itself in), so the early frames
// show a half-drawn athlete — e.g. cricket's batsman has no legs until frame 10.
// Loop each sport from the frame where its figure is fully drawn, so the
// focused disc always shows a complete athlete, never a partial reveal.
// (measured: first frame reaching 70% of the final alpha coverage.)
const START_FRAME = {
  badminton: 2, basketball: 0, boxing: 0, cricket: 0, football: 2,
  handball: 0, hockey: 4, judo: 0, kabaddi: 0, karate: 0, khokho: 1,
  pickleball: 2, rummy: 1, skateboard: 0, squash: 0, tabletennis: 0,
  tennis: 0, volleyball: 2, wrestling: 0,
};

// (The pickleball/volleyball swing-arc "swoosh", baked-in ring circles and
// low-alpha matte halos have all been scrubbed from the source frames — see
// the cleanup pass — so every sport now loops its full clip.)

export const hasSportAnim = (id) => Boolean(FRAMES[id]);

export default function SportLogoIcon({ id, size = 54, color = '#c4f82a', active = false }) {
  const frames = FRAMES[id];
  const last = frames.length - 1;
  const start = START_FRAME[id] ?? 0;         // loop from where the figure is fully drawn
  const end = last;
  const rest = last;                          // rest on the finished logo
  const [frame, setFrame] = useState(rest);
  const tick = useRef(start);

  useEffect(() => {
    if (!active) { setFrame(rest); return; }
    tick.current = start;
    const timer = setInterval(() => {
      const t = tick.current;
      setFrame(t <= end ? t : end);
      tick.current = t >= end + HOLD_TICKS ? start : t + 1;
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [active, id, end, start, rest]);

  const dim = { width: size, height: size };

  // At rest: a single static Image of the finished logo (cheap for the 18
  // unfocused discs). When focused: stack every frame, reveal one by opacity.
  if (!active) {
    return <Image source={frames[last]} style={dim} tintColor={color} resizeMode="contain" fadeDuration={0} />;
  }

  // Ring Buffer (3 Images): eliminates OOM (hiding) by only mounting 3 images instead of 30,
  // and eliminates flickering by pre-decoding the next frame (opacity 0) 80ms before it's shown.
  const getSourceForSlot = (slot) => {
    if (frame % 3 === slot) return frame; // Current frame
    if ((frame + 1) % 3 === slot) return Math.min(frame + 1, last); // Next frame (pre-decoding)
    return Math.max(frame - 1, 0); // Previous frame
  };

  return (
    <View style={dim}>
      {[0, 1, 2].map((slot) => (
        <Image
          key={slot}
          source={frames[getSourceForSlot(slot)]}
          style={[dim, { position: 'absolute', opacity: frame % 3 === slot ? 1 : 0 }]}
          tintColor={color}
          resizeMode="contain"
          fadeDuration={0}
        />
      ))}
    </View>
  );
}
