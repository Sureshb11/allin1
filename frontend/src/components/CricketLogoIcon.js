// CricketLogoIcon — frame-sequence animation of the cricket tournament logo
// (batsman inside a ring with stumps, swinging through the ball). Sourced from
// the designer's 4s reveal video: the background was keyed out and each frame
// inverted to a white silhouette on transparent, so `tintColor` recolours it to
// match the Arena disc state (accent glyph at rest, dark glyph on the focused
// solid disc). Pure RN — a single <Image> whose source swaps per tick, no video
// dependency. When inactive it holds the finished logo (last frame) statically.
//
//   <CricketLogoIcon size={46} color={accent} active={focused} />

import { useEffect, useRef, useState } from 'react';
import { Image } from 'react-native';

// Static requires (Metro needs literal paths) — the 30 reveal frames in order.
const FRAMES = [
  require('../assets/cricketAnim/f01.png'),
  require('../assets/cricketAnim/f02.png'),
  require('../assets/cricketAnim/f03.png'),
  require('../assets/cricketAnim/f04.png'),
  require('../assets/cricketAnim/f05.png'),
  require('../assets/cricketAnim/f06.png'),
  require('../assets/cricketAnim/f07.png'),
  require('../assets/cricketAnim/f08.png'),
  require('../assets/cricketAnim/f09.png'),
  require('../assets/cricketAnim/f10.png'),
  require('../assets/cricketAnim/f11.png'),
  require('../assets/cricketAnim/f12.png'),
  require('../assets/cricketAnim/f13.png'),
  require('../assets/cricketAnim/f14.png'),
  require('../assets/cricketAnim/f15.png'),
  require('../assets/cricketAnim/f16.png'),
  require('../assets/cricketAnim/f17.png'),
  require('../assets/cricketAnim/f18.png'),
  require('../assets/cricketAnim/f19.png'),
  require('../assets/cricketAnim/f20.png'),
  require('../assets/cricketAnim/f21.png'),
  require('../assets/cricketAnim/f22.png'),
  require('../assets/cricketAnim/f23.png'),
  require('../assets/cricketAnim/f24.png'),
  require('../assets/cricketAnim/f25.png'),
  require('../assets/cricketAnim/f26.png'),
  require('../assets/cricketAnim/f27.png'),
  require('../assets/cricketAnim/f28.png'),
  require('../assets/cricketAnim/f29.png'),
  require('../assets/cricketAnim/f30.png'),
];
const LAST = FRAMES.length - 1;
const START = 1;       // skip the fully-blank first frame so restarts don't flicker
const FRAME_MS = 80;   // ~12fps playback
const HOLD_TICKS = 6;  // beat on the finished logo before the reveal restarts

export default function CricketLogoIcon({ size = 46, color = '#c4f82a', active = false }) {
  const [frame, setFrame] = useState(LAST);   // rest on the finished logo
  const tick = useRef(START);

  useEffect(() => {
    if (!active) { setFrame(LAST); return; }
    tick.current = START;
    const id = setInterval(() => {
      const t = tick.current;
      // play START..LAST, then hold LAST for a few ticks, then loop
      setFrame(t <= LAST ? t : LAST);
      tick.current = t >= LAST + HOLD_TICKS ? START : t + 1;
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [active]);

  return (
    <Image
      source={FRAMES[frame]}
      style={{ width: size, height: size }}
      tintColor={color}
      resizeMode="contain"
      fadeDuration={0}
    />
  );
}
