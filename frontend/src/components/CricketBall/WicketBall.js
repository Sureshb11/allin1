// ─────────────────────────────────────────────────────────────────────────────
// WicketBall — the in-place event animation for the live spectator screen.
//
// On a big moment (WICKET / FOUR / SIX) the spectator's signature ball IS the
// celebration: this component plays a keyed PNG sequence exactly where the
// static ball sits — same size, transparent background, no full-screen
// takeover. It reuses AnimatedBall's ring geometry so its box matches the ball
// it replaces 1:1, and it positions the frames so the animated ball lands on
// the same centre as the static one (each clip starts and ends on the idle
// ball, so the hand-off in and out is seamless).
//
// `clip` picks the sequence ({ frames, fps, canvasPerBall, centerFracY });
// defaults to the WICKET shatter. fourFrames / sixFrames provide the others —
// each clip carries its own measured geometry since the ball's on-canvas size
// differs per render.
//
// All frames stay mounted, stacked on the same box; playback (a time-based rAF
// loop, so it holds the clip's fps regardless of render cost) only flips which
// one is visible. Swapping a single <Image>'s source instead would make
// Android decode each frame on first show mid-playback — visible flicker.
// One shot: onDone fires when the last frame has shown.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import { View, Image } from 'react-native';
import {
  WICKET_FRAMES, WICKET_FPS, WICKET_CANVAS_PER_BALL, WICKET_BALL_CENTER_FRAC_Y,
} from './wicketFrames';

export const WICKET_CLIP = {
  frames: WICKET_FRAMES,
  fps: WICKET_FPS,
  canvasPerBall: WICKET_CANVAS_PER_BALL,
  centerFracY: WICKET_BALL_CENTER_FRAC_Y,
};

// Ring geometry — kept identical to AnimatedBall so the layout box (and thus the
// bottom-centre anchor) is the same whether the ball is idle or celebrating.
const RING_AR   = 386 / 1229;
const RING_CY   = 0.482;
const CORE_FRAC = 1038 / 1229;
const RING_SCALE = 0.973 / CORE_FRAC;

export default function WicketBall({ size = 56, playKey, clip = WICKET_CLIP, onDone }) {
  const [frame, setFrame] = useState(0);
  const raf   = useRef(null);
  const start = useRef(0);
  const done  = useRef(onDone);
  done.current = onDone;

  // (re)start the sequence whenever a new event fires (playKey changes)
  useEffect(() => {
    setFrame(0);
    start.current = 0;
    const total = clip.frames.length;
    const step = (t) => {
      if (!start.current) start.current = t;
      const i = Math.floor(((t - start.current) / 1000) * clip.fps);
      if (i >= total - 1) { setFrame(total - 1); done.current?.(); return; }
      setFrame(i);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => raf.current && cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey]);

  // box — matches AnimatedBall exactly
  const ringW = size * RING_SCALE;
  const ringH = ringW * RING_AR;
  const W = Math.max(size, ringW);
  const ringTop = size - ringH * RING_CY;
  const H = ringTop + ringH;

  // frame image: sized from the ball diameter, centred on the static ball's centre
  const imgW = size * clip.canvasPerBall;
  const imgH = imgW;                          // source frames are square
  const left = W / 2 - imgW / 2;              // ball is centred in the frame
  const top  = size / 2 - imgH * clip.centerFracY;

  const box = { position: 'absolute', left, top, width: imgW, height: imgH };
  return (
    <View style={{ width: W, height: H }} pointerEvents="none">
      {clip.frames.map((src, i) => (
        <Image key={i} source={src} fadeDuration={0}
          style={[box, { opacity: i === frame ? 1 : 0 }]} />
      ))}
    </View>
  );
}
