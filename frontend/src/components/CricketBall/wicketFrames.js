// ─────────────────────────────────────────────────────────────────────────────
// wicketFrames — the WICKET moment as a transparent PNG sequence.
//
// Extracted from the original 8s 1280x720 wicket clip (the signature ball
// shattering in a red spark burst with a WICKET flash, then reforming). The
// dark video background is keyed to alpha so the clip drops straight onto the
// live screen with NO backdrop — it simply replaces the spectator ball in place.
//
// 73 frames, played at 24fps (~3s), starting and ending on the idle ball so
// the swap in/out of the static ball is seamless. Geometry (for WicketBall):
//   source frame 200x200, ball centred, diameter = 410/720 of the canvas,
//   ball-centre at y-fraction 0.554 from the top.
//
// Source clip: NOT assets/ball/ball_wicket.mp4 — that is a later, tight-cropped
// close-up (256x256, ball bleeding off every edge) that only the Ball Lab video
// preview plays; it cannot be keyed into these sprites. These frames come from
// the original 8s clip, now kept outside the app at "ball animation/wicket.mp4".
//
// Re-cut with scripts/build_wicket_frames.py (which also cuts the FOUR/SIX
// sequences — see fourFrames.js / sixFrames.js), then regenerate the
// require() manifest below and re-measure the geometry constants. Any
// replacement clip must keep the ball small enough to leave margin for the
// ring and the spark burst, on a flat dark background, or it cannot be keyed
// into a usable sprite.
// ─────────────────────────────────────────────────────────────────────────────
export const WICKET_FRAMES = [
  require('../../../assets/ball/wicket_frames/w00.png'),
  require('../../../assets/ball/wicket_frames/w01.png'),
  require('../../../assets/ball/wicket_frames/w02.png'),
  require('../../../assets/ball/wicket_frames/w03.png'),
  require('../../../assets/ball/wicket_frames/w04.png'),
  require('../../../assets/ball/wicket_frames/w05.png'),
  require('../../../assets/ball/wicket_frames/w06.png'),
  require('../../../assets/ball/wicket_frames/w07.png'),
  require('../../../assets/ball/wicket_frames/w08.png'),
  require('../../../assets/ball/wicket_frames/w09.png'),
  require('../../../assets/ball/wicket_frames/w10.png'),
  require('../../../assets/ball/wicket_frames/w11.png'),
  require('../../../assets/ball/wicket_frames/w12.png'),
  require('../../../assets/ball/wicket_frames/w13.png'),
  require('../../../assets/ball/wicket_frames/w14.png'),
  require('../../../assets/ball/wicket_frames/w15.png'),
  require('../../../assets/ball/wicket_frames/w16.png'),
  require('../../../assets/ball/wicket_frames/w17.png'),
  require('../../../assets/ball/wicket_frames/w18.png'),
  require('../../../assets/ball/wicket_frames/w19.png'),
  require('../../../assets/ball/wicket_frames/w20.png'),
  require('../../../assets/ball/wicket_frames/w21.png'),
  require('../../../assets/ball/wicket_frames/w22.png'),
  require('../../../assets/ball/wicket_frames/w23.png'),
  require('../../../assets/ball/wicket_frames/w24.png'),
  require('../../../assets/ball/wicket_frames/w25.png'),
  require('../../../assets/ball/wicket_frames/w26.png'),
  require('../../../assets/ball/wicket_frames/w27.png'),
  require('../../../assets/ball/wicket_frames/w28.png'),
  require('../../../assets/ball/wicket_frames/w29.png'),
  require('../../../assets/ball/wicket_frames/w30.png'),
  require('../../../assets/ball/wicket_frames/w31.png'),
  require('../../../assets/ball/wicket_frames/w32.png'),
  require('../../../assets/ball/wicket_frames/w33.png'),
  require('../../../assets/ball/wicket_frames/w34.png'),
  require('../../../assets/ball/wicket_frames/w35.png'),
  require('../../../assets/ball/wicket_frames/w36.png'),
  require('../../../assets/ball/wicket_frames/w37.png'),
  require('../../../assets/ball/wicket_frames/w38.png'),
  require('../../../assets/ball/wicket_frames/w39.png'),
  require('../../../assets/ball/wicket_frames/w40.png'),
  require('../../../assets/ball/wicket_frames/w41.png'),
  require('../../../assets/ball/wicket_frames/w42.png'),
  require('../../../assets/ball/wicket_frames/w43.png'),
  require('../../../assets/ball/wicket_frames/w44.png'),
  require('../../../assets/ball/wicket_frames/w45.png'),
  require('../../../assets/ball/wicket_frames/w46.png'),
  require('../../../assets/ball/wicket_frames/w47.png'),
  require('../../../assets/ball/wicket_frames/w48.png'),
  require('../../../assets/ball/wicket_frames/w49.png'),
  require('../../../assets/ball/wicket_frames/w50.png'),
  require('../../../assets/ball/wicket_frames/w51.png'),
  require('../../../assets/ball/wicket_frames/w52.png'),
  require('../../../assets/ball/wicket_frames/w53.png'),
  require('../../../assets/ball/wicket_frames/w54.png'),
  require('../../../assets/ball/wicket_frames/w55.png'),
  require('../../../assets/ball/wicket_frames/w56.png'),
  require('../../../assets/ball/wicket_frames/w57.png'),
  require('../../../assets/ball/wicket_frames/w58.png'),
  require('../../../assets/ball/wicket_frames/w59.png'),
  require('../../../assets/ball/wicket_frames/w60.png'),
  require('../../../assets/ball/wicket_frames/w61.png'),
  require('../../../assets/ball/wicket_frames/w62.png'),
  require('../../../assets/ball/wicket_frames/w63.png'),
  require('../../../assets/ball/wicket_frames/w64.png'),
  require('../../../assets/ball/wicket_frames/w65.png'),
  require('../../../assets/ball/wicket_frames/w66.png'),
  require('../../../assets/ball/wicket_frames/w67.png'),
  require('../../../assets/ball/wicket_frames/w68.png'),
  require('../../../assets/ball/wicket_frames/w69.png'),
  require('../../../assets/ball/wicket_frames/w70.png'),
  require('../../../assets/ball/wicket_frames/w71.png'),
  require('../../../assets/ball/wicket_frames/w72.png'),
];

// Playback rate. The clip was shot at 24fps; it plays slower than source so
// the shatter is readable as a moment rather than a flash (73 frames ≈ 6s).
export const WICKET_FPS = 12;
// canvas edge / ball diameter, and ball-centre fraction down the canvas.
// Measured on the hand-off frames (w00/w72): ball equator 96px of the 200px
// canvas, centre at y≈104 — so the animated ball renders at exactly the
// static ball's size when the canvas is scaled by 200/96.
export const WICKET_CANVAS_PER_BALL = 200 / 96;
export const WICKET_BALL_CENTER_FRAC_Y = 0.52;
