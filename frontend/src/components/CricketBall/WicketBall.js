// ─────────────────────────────────────────────────────────────────────────────
// WicketBall — the inline WICKET animation for the live spectator screen.
//
// When a wicket falls, the spectator's signature ball IS the celebration: this
// component plays the keyed PNG sequence (assets/ball/wicket_frames) exactly
// where the static ball sits — same size, transparent background, no full-screen
// takeover. It reuses AnimatedBall's ring geometry so its box matches the ball
// it replaces 1:1, and it positions the frames so the animated ball lands on the
// same centre as the static one (the clip starts and ends on the idle ball, so
// the hand-off in and out is seamless).
//
// Playback is a single <Image> whose source is advanced by a time-based rAF loop
// (so it keeps 24fps regardless of render cost) with fadeDuration=0 — the Android
// default cross-fade on source change would otherwise smear every frame. One shot:
// onDone fires when the last frame has shown.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import { View, Image } from 'react-native';
import {
  WICKET_FRAMES, WICKET_FPS, WICKET_CANVAS_PER_BALL, WICKET_BALL_CENTER_FRAC_Y,
} from './wicketFrames';

// Ring geometry — kept identical to AnimatedBall so the layout box (and thus the
// bottom-centre anchor) is the same whether the ball is idle or shattering.
const RING_AR   = 386 / 1229;
const RING_CY   = 0.482;
const CORE_FRAC = 1038 / 1229;
const RING_SCALE = 0.973 / CORE_FRAC;

export default function WicketBall({ size = 56, playKey, onDone }) {
  const [frame, setFrame] = useState(0);
  const raf   = useRef(null);
  const start = useRef(0);
  const done  = useRef(onDone);
  done.current = onDone;

  // (re)start the sequence whenever a new wicket fires (playKey changes)
  useEffect(() => {
    setFrame(0);
    start.current = 0;
    const total = WICKET_FRAMES.length;
    const step = (t) => {
      if (!start.current) start.current = t;
      const i = Math.floor(((t - start.current) / 1000) * WICKET_FPS);
      if (i >= total - 1) { setFrame(total - 1); done.current?.(); return; }
      setFrame(i);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => raf.current && cancelAnimationFrame(raf.current);
  }, [playKey]);

  // box — matches AnimatedBall exactly
  const ringW = size * RING_SCALE;
  const ringH = ringW * RING_AR;
  const W = Math.max(size, ringW);
  const ringTop = size - ringH * RING_CY;
  const H = ringTop + ringH;

  // frame image: sized from the ball diameter, centred on the static ball's centre
  const imgW = size * WICKET_CANVAS_PER_BALL;
  const imgH = imgW;                          // source frames are square
  const left = W / 2 - imgW / 2;              // ball is centred in the frame
  const top  = size / 2 - imgH * WICKET_BALL_CENTER_FRAC_Y;

  return (
    <View style={{ width: W, height: H }} pointerEvents="none">
      <Image
        source={WICKET_FRAMES[frame]}
        fadeDuration={0}
        style={{ position: 'absolute', left, top, width: imgW, height: imgH }}
      />
    </View>
  );
}
