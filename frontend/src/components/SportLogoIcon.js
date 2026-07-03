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
  badminton: 2, basketball: 0, boxing: 0, cricket: 10, football: 2,
  handball: 0, hockey: 4, judo: 0, karate: 0, khokho: 1, pickleball: 2,
  rummy: 1, skateboard: 0, squash: 0, tabletennis: 0, tennis: 0,
  volleyball: 2, wrestling: 0,
};

// pickleball & volleyball draw a moving swing-arc "swoosh" from the mid frames
// on (a stray ring that can't be cleaned like the static rings). Their EARLY
// frames animate cleanly, so cap their loop before the swoosh appears.
const END_FRAME = { pickleball: 12, volleyball: 15 };

export const hasSportAnim = (id) => Boolean(FRAMES[id]);

export default function SportLogoIcon({ id, size = 54, color = '#c4f82a', active = false }) {
  const frames = FRAMES[id];
  const last = frames.length - 1;
  const start = START_FRAME[id] ?? 0;         // loop from where the figure is fully drawn
  const end = END_FRAME[id] ?? last;          // …to here (caps sports with a late swoosh)
  const rest = END_FRAME[id] ?? last;         // rest on a clean frame (end for capped sports)
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

  // Stack every frame with the SAME explicit sizing as the static <Image>
  // above (absolutely positioned so they overlap), and reveal one via opacity.
  // Using absoluteFill here instead mis-sized the contained image — the active
  // disc rendered the art tiny (~30%) while the static disc was correct.
  return (
    <View style={dim}>
      {frames.map((src, i) => (
        <Image
          key={i}
          source={src}
          style={[dim, { position: 'absolute', opacity: i === frame ? 1 : 0 }]}
          tintColor={color}
          resizeMode="contain"
          fadeDuration={0}
        />
      ))}
    </View>
  );
}
