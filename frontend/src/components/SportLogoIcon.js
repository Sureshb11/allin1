// SportLogoIcon — frame-sequence logo animation for the Arena picker discs.
// Every sport's designer video (ProRes 4444 w/ alpha) was distilled to 30
// white-on-transparent PNG frames (assets/arenaAnim/<id>/), recoloured at
// render via `tintColor` so the scene takes the disc state: accent glyph at
// rest, dark glyph on the focused solid disc. Pure RN — one <Image> whose
// source swaps per tick, no video dependency. Inactive discs hold the
// finished logo (last frame) statically, so honeycomb pans stay cheap.
//
//   <SportLogoIcon id="tennis" size={46} color={accent} active={focused} />
//
// hasSportAnim(id) → whether a sport has frames (kabaddi has no video yet
// and keeps its static SportIcon glyph).

import { useEffect, useRef, useState } from 'react';
import { Image } from 'react-native';
import FRAMES from './arenaAnimFrames';

const FRAME_MS = 80;   // ~12fps playback
const HOLD_TICKS = 6;  // beat on the finished logo before the loop restarts
const START = 1;       // skip the (often blank) first frame so restarts don't flicker

export const hasSportAnim = (id) => Boolean(FRAMES[id]);

export default function SportLogoIcon({ id, size = 46, color = '#c4f82a', active = false }) {
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

  return (
    <Image
      source={frames[frame]}
      style={{ width: size, height: size }}
      tintColor={color}
      resizeMode="contain"
      fadeDuration={0}
    />
  );
}
