#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────────
# build_wicket_frames.py — cut the ball-event clips (WICKET / FOUR / SIX) into
# the transparent PNG sequences the live spectator screen plays in place of
# the signature ball.
#
# For each clip it:
#   · keys the near-black background to alpha (distance-from-bg matte) so the
#     sequence drops onto any background with no visible box
#   · restores the ball solid: transparent pockets enclosed by opaque pixels
#     get a second, gentler ramp — dark leather turns opaque, but pockets of
#     true background caught between sparks/swirls stay transparent (forcing
#     them opaque paints black patches on light screens)
#   · un-premultiplies the colour: semi-transparent effect pixels still carry
#     the dark ground they were rendered over, which composites as a dirty
#     grey drop-shadow on light screens — dividing it out keeps glows bright
#     at low alpha (identical on dark screens)
#   · crops square around the (centred) ball, trims to the idle→idle window
#     so the swap with the static ball is seamless, and downscales
#   · six only: the clip ends with the "6" glyph still glowing, so its last
#     frames are dissolved toward the idle frame before keying
#
# After running:
#   pngquant --quality=55-88 --ext .png --force --speed 1 \
#            frontend/assets/ball/{wicket,four,six}_frames/*.png
# and regenerate the require() manifests in src/components/CricketBall/
# (wicketFrames.js / fourFrames.js / sixFrames.js — one entry per frame), then
# re-measure the hand-off ball for each module's geometry constants.
#
# Deps:  pip install pillow numpy scipy   (ffmpeg on PATH)
# ─────────────────────────────────────────────────────────────────────────────
import os
import subprocess
import sys
import tempfile
import numpy as np
from scipy.ndimage import (binary_fill_holes, binary_closing, binary_dilation,
                           binary_erosion, label, gaussian_filter)
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "assets", "ball"))
# The source clips live outside the app (only their keyed frames ship).
CLIPS_DIR = "/Volumes/BSB/allin1-local/ball animation"

# All three clips share the render setup: 1280x720, 24fps, ball centred at
# x=640 with diameter ~345, on a ~(16,16,21) background.
BG        = np.array([16, 16, 21], dtype=np.float32)
KEY_LO    = 55.0    # matte ramp: distance from BG that starts to become opaque
KEY_HI    = 120.0   # …and where it is fully opaque
KEY_GAMMA = 1.2     # >1 hardens the edge (cleaner over white)
POCKET_LO, POCKET_HI = 12.0, 38.0   # gentler ramp inside enclosed pockets
CROP_X0, CROP_X1 = 280, 1000        # square window, ball centred
SIZE      = 200     # output edge in px (retina for a ~56px on-screen ball)

# White-half colour-correction (four/six only). The signature ball is two-tone —
# red hemisphere + white hemisphere. In the four/six clips the bright GREEN
# energy light throws a green CAST on the white half (measured ~[220,231,207] —
# green channel highest), so it reads as a sickly green-white "patch". The
# wicket ball has no such energy wash and its white stays neutral (~[212,205,200])
# and looks real. So rather than darken the white (which just makes it grey), we
# NEUTRALISE the green cast: on the light, non-red pixels of the ball we lock G,B
# to warm-neutral ratios of R (the wicket white balance) so the white becomes a
# clean neutral white too. The red half, green energy/glyph and white swoosh are
# untouched; the wicket ball needs none of this.
WHITE_GK, WHITE_BK = 0.965, 0.945   # wicket white ratios G/R, B/R

# (out dir, clip file, first, last, step, frame prefix, tail-dissolve frames,
#  tone-white the ball's white half?)
CLIPS = [
    ("wicket_frames", "wicket.mp4",    24, 169, 2, "w", 0,  False),
    ("four_frames",   "ball_four.mp4", 14, 189, 2, "f", 0,  True),
    ("six_frames",    "ball_six.mp4",  27, 192, 2, "s", 10, True),
]


def cut(fr, solid=None, warm=False):
    """Key the near-black bg to alpha.
    `warm` (four/six only): count red dominance (R−B) as distance from the
    key colour — the bg is blue-ish dark (16,16,21) while dark RED leather in
    the ball's shadow side sits close to it in plain distance and used to key
    semi-transparent ("empty space in ball"); red dominance separates them.
    `solid` (four/six only) is a soft 0..1 mask of the ball's interior —
    alpha is forced opaque there BEFORE the un-premultiply so nothing inside
    the ball silhouette can stay translucent. Wicket passes neither and is
    bit-for-bit the old behaviour."""
    d = np.sqrt(((fr - BG) ** 2).sum(axis=2))
    if warm:
        d = d + 2.5 * np.maximum(0.0, fr[..., 0] - fr[..., 2] - 6.0)
    a = np.clip((d - KEY_LO) / (KEY_HI - KEY_LO), 0, 1) ** KEY_GAMMA
    hard = a > 0.5
    pocket = binary_fill_holes(binary_closing(hard, structure=np.ones((5, 5)))) & (a < 1.0)
    a2 = np.clip((d - POCKET_LO) / (POCKET_HI - POCKET_LO), 0, 1)
    a = np.where(pocket, np.maximum(a, a2), a)
    if solid is not None:
        a = np.maximum(a, solid)
    am = np.clip(a, 1e-3, 1.0)[..., None]
    fr = np.clip((fr - (1.0 - am) * BG) / am, 0, 255)
    return fr, a


def _ball_cand(fr, alpha):
    """Opaque, non-green pixels — candidate ball material."""
    r, g, b = fr[..., 0], fr[..., 1], fr[..., 2]
    lum = 0.299*r + 0.587*g + 0.114*b
    green_dom = (g > r + 16) & (g > b + 16)
    return binary_closing((alpha > 0.6) & ~green_dom & (lum > 45),
                          structure=np.ones((5, 5)), iterations=2)


def _ball_geom(fr, alpha):
    """Candidate mask + the main blob's centre/size. Returns
    (cand, blob, cy, cx, rad_half_min) or None if nothing found."""
    cand = _ball_cand(fr, alpha)
    lab, n = label(cand)
    if n == 0:
        return None
    sizes = np.array([(lab == k).sum() for k in range(1, n + 1)])
    k = int(sizes.argmax()) + 1
    blob = binary_fill_holes(lab == k)
    ys, xs = np.where(blob)
    cy, cx = ys.mean(), xs.mean()
    h = ys.max() - ys.min() + 1; w = xs.max() - xs.min() + 1
    return cand, blob, cy, cx, 0.5 * min(h, w)


def _disc(shape, cy, cx, rad):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    return np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) < rad


def _ball_blob(fr, alpha):
    """Largest opaque, non-green blob = the ball; holes filled and clipped to a
    generous disc so a merged white-swoosh tail can't drag it off the ball.
    Tracks the ball as it moves. Returns a bool mask (or None if not found)."""
    geom = _ball_geom(fr, alpha)
    if geom is None:
        return None
    _, blob, cy, cx, hr = geom
    return blob & _disc(fr.shape[:2], cy, cx, hr * 1.35)


def _ball_mask(fr, alpha):
    """The ball SILHOUETTE for colour work: lightly dilated so the mask reaches
    the ball's bright specular RIM (a soft fitted disc left that rim untoned —
    the leftover bright crescent read as the 'white patch')."""
    blob = _ball_blob(fr, alpha)
    if blob is None:
        return np.zeros(fr.shape[:2], np.float32)
    mask = binary_dilation(blob, iterations=3).astype(np.float32)
    return np.clip(gaussian_filter(mask, sigma=1.5), 0, 1)


def _ball_solid(fr, alpha):
    """The ball INTERIOR for alpha-forcing: ball material with any translucent
    channels sealed. Translucent strips (the seam channel, a dark swoosh band
    crossing in front of the ball) can run OPEN to the ball's edge or split
    the silhouette in two, so binary_fill_holes alone never closes them — take
    ALL candidate fragments within a tight disc around the main blob, bridge
    the gaps with a wide closing, then fill holes. Eroded a touch + feathered
    so the ball's soft anti-aliased rim (and any motion-blur ghost outside it)
    keeps its original alpha."""
    geom = _ball_geom(fr, alpha)
    if geom is None:
        return np.zeros(fr.shape[:2], np.float32)
    cand, blob, cy, cx, hr = geom
    tight = _disc(fr.shape[:2], cy, cx, hr * 1.12)
    frag = (cand | blob) & tight
    solid = binary_fill_holes(binary_closing(frag, structure=np.ones((17, 17)))) & tight
    solid = binary_erosion(solid, iterations=2).astype(np.float32)
    return np.clip(gaussian_filter(solid, sigma=1.0), 0, 1)


def tone_white(fr, alpha):
    """Neutralise the green cast on the ball's white half so it reads as clean
    neutral white (matching the wicket ball); red half untouched."""
    mask = _ball_mask(fr, alpha)
    R, G, B = fr[..., 0], fr[..., 1], fr[..., 2]
    lum = 0.299*R + 0.587*G + 0.114*B
    light = np.clip((lum - 85) / 70, 0, 1)
    not_red = np.clip((G - 0.58*R) / 35, 0, 1)          # 0 on the red half
    w = mask * light * not_red
    Gn = G - np.maximum(0, G - WHITE_GK * R)            # pull green down, never boost
    Bn = B - np.maximum(0, B - WHITE_BK * R)
    out = np.stack([R, G*(1-w) + Gn*w, B*(1-w) + Bn*w], -1)
    # soft highlight rolloff so a blown white settles to a clean ~222
    l2 = 0.299*out[..., 0] + 0.587*out[..., 1] + 0.114*out[..., 2]
    over = np.clip((l2 - 215) / 60, 0, 1) * mask
    return np.clip(out * (1 - (over * 0.14)[..., None]), 0, 255)


# Motion-blur radius (source frames) for the tone clips. A fast-spinning
# two-tone ball sampled at the play framerate strobes red↔white ("flickering");
# integrating a triangular window of neighbouring SOURCE frames (including the
# ones the step skips) smears the spin into smooth rotation instead. Kept small
# so red and white don't average into a grey mush.
BLUR_R = 3


def _load_src(clip):
    tmp = tempfile.mkdtemp()
    subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(CLIPS_DIR, clip),
                    f"{tmp}/f%03d.png", "-y"], check=True)
    fs = sorted(f for f in os.listdir(tmp) if f.endswith(".png"))
    return [np.asarray(Image.open(os.path.join(tmp, f)).convert("RGB"),
                       dtype=np.float32)[:, CROP_X0:CROP_X1] for f in fs]


def _blur(frames, center, R):
    acc = None; wsum = 0
    for o in range(-R, R + 1):
        j = min(max(center + o, 0), len(frames) - 1); wt = R + 1 - abs(o)
        acc = frames[j] * wt if acc is None else acc + frames[j] * wt
        wsum += wt
    return acc / wsum


def main(only=None):
    for name, clip, lo, hi, step, pfx, tail, tone in CLIPS:
        if only and name not in only:
            continue
        out = os.path.join(ASSETS, name)
        os.makedirs(out, exist_ok=True)
        for fn in os.listdir(out):
            os.remove(os.path.join(out, fn))
        frames = _load_src(clip)
        sel = list(range(lo, hi, step))
        idle = frames[0]
        for i, idx in enumerate(sel):
            # tone clips get motion-blurred (smooth spin); wicket stays crisp.
            fr = _blur(frames, idx, BLUR_R) if tone else frames[idx].copy()
            if tail and i >= len(sel) - tail:
                t = (i - (len(sel) - tail) + 1) / tail
                fr = fr * (1 - t) + idle * t
            if tone:
                # Ball-interior mask from the SHARP centre frame — the blur
                # smears bg into moving-ball pixels, which used to soften the
                # keyed alpha INSIDE the ball ("empty space in ball"); the
                # sharp frame gives the true silhouette to force opaque.
                sharp = frames[idx].copy()
                if tail and i >= len(sel) - tail:
                    sharp = sharp * (1 - t) + idle * t
                _, a_sh = cut(sharp, warm=True)
                solid = _ball_solid(sharp, a_sh)
                _, a0 = cut(fr.copy(), warm=True)
                fr = tone_white(fr, a0)
                fr, a = cut(fr, solid=solid, warm=True)
            else:
                fr, a = cut(fr)
            rgba = np.dstack([fr.astype(np.uint8), (a * 255).astype(np.uint8)])
            (Image.fromarray(rgba, "RGBA")
                  .resize((SIZE, SIZE), Image.LANCZOS)
                  .save(os.path.join(out, f"{pfx}{i:02d}.png"), optimize=True))
        print(f"{name}: wrote {len(sel)} frames")


if __name__ == "__main__":
    # Optional args restrict which sets are rebuilt, e.g.
    #   python build_wicket_frames.py four_frames six_frames
    # (the wicket set is approved — no need to churn its bytes).
    main(sys.argv[1:] or None)
