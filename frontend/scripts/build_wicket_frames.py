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
import tempfile
import numpy as np
from scipy.ndimage import binary_fill_holes, binary_closing, label, gaussian_filter
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

# Ball recolor (four/six only). In those source clips the ball spins to a
# near-white face at the climax, which reads as an ugly white patch mid-flight
# (the wicket clip stays red, so it needs none of this). We pull the washed-out
# leather back toward red — preserving luminance so shading/seam survive — while
# leaving the saturated green energy/glyph and the white swoosh untouched.
#   · disc mask: four's ball stays centred → a soft centred disc covers it
#   · blob mask: six's ball leaps around → track it as the big round pale blob
LEATHER      = np.array([255., 58., 54.])
LEATHER_LUMA = 0.299*LEATHER[0] + 0.587*LEATHER[1] + 0.114*LEATHER[2]
LUMA_CAP     = 195.0    # keep the brightest ball frames deep red, not pink

# (out dir, clip file, first, last, step, frame prefix, tail-dissolve frames,
#  ball-recolor mask kind, canvas-per-ball, ball-centre-fraction-Y)
CLIPS = [
    ("wicket_frames", "wicket.mp4",    24, 169, 2, "w", 0,  None,   None,   None),
    ("four_frames",   "ball_four.mp4", 14, 189, 2, "f", 0,  "disc", 200/95, 0.55),
    ("six_frames",    "ball_six.mp4",  27, 192, 2, "s", 10, "blob", 200/84, 0.565),
]


def cut(fr):
    d = np.sqrt(((fr - BG) ** 2).sum(axis=2))
    a = np.clip((d - KEY_LO) / (KEY_HI - KEY_LO), 0, 1) ** KEY_GAMMA
    hard = a > 0.5
    pocket = binary_fill_holes(binary_closing(hard, structure=np.ones((5, 5)))) & (a < 1.0)
    a2 = np.clip((d - POCKET_LO) / (POCKET_HI - POCKET_LO), 0, 1)
    a = np.where(pocket, np.maximum(a, a2), a)
    am = np.clip(a, 1e-3, 1.0)[..., None]
    fr = np.clip((fr - (1.0 - am) * BG) / am, 0, 255)
    return fr, a


def _disc_mask(shape, cpb, cfy):
    H, W = shape
    r = (W / cpb) / 2.0
    cx, cy = W / 2.0, H * cfy
    ys, xs = np.mgrid[0:H, 0:W]
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    return np.clip((r * 1.05 - dist) / (r * 0.20), 0, 1)


def _blob_mask(fr, alpha):
    rgb = fr.astype(np.float32)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (rgb.max(axis=2) + 1e-3)
    luma = 0.299*rgb[..., 0] + 0.587*rgb[..., 1] + 0.114*rgb[..., 2]
    cand = binary_closing((sat < 0.30) & (luma > 120) & (alpha > 0.6),
                          structure=np.ones((5, 5)))
    lab, n = label(cand)
    keep = np.zeros_like(cand)
    for k in range(1, n + 1):
        m = lab == k
        area = m.sum()
        if area < 900:                       # drop scattered sparkle dust
            continue
        ys, xs = np.where(m)
        h = ys.max() - ys.min() + 1; w = xs.max() - xs.min() + 1
        if area / (h * w) > 0.45 and 0.55 < w / h < 1.8:   # round-ish = the ball
            keep |= m
    return np.clip(gaussian_filter(binary_fill_holes(keep).astype(np.float32), sigma=3), 0, 1)


def recolor(fr, alpha, mask):
    rgb = fr.astype(np.float32)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (rgb.max(axis=2) + 1e-3)
    luma = 0.299*rgb[..., 0] + 0.587*rgb[..., 1] + 0.114*rgb[..., 2]
    pale = np.clip((0.32 - sat) / 0.27, 0, 1)          # 1 grey … 0 saturated
    bright = np.clip((luma - 90) / 80, 0, 1)
    w = (pale * bright * mask)[..., None]
    target = (np.minimum(luma, LUMA_CAP) / LEATHER_LUMA)[..., None] * LEATHER
    return np.clip(rgb * (1 - w) + target * w, 0, 255)


def main():
    for name, clip, lo, hi, step, pfx, tail, mask_kind, cpb, cfy in CLIPS:
        out = os.path.join(ASSETS, name)
        os.makedirs(out, exist_ok=True)
        for fn in os.listdir(out):
            os.remove(os.path.join(out, fn))
        tmp = tempfile.mkdtemp()
        subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(CLIPS_DIR, clip),
                        f"{tmp}/f%03d.png", "-y"], check=True)
        sel = list(range(lo, hi, step))
        idle = np.asarray(Image.open(f"{tmp}/f001.png").convert("RGB"),
                          dtype=np.float32)[:, CROP_X0:CROP_X1]
        for i, idx in enumerate(sel):
            fr = np.asarray(Image.open(f"{tmp}/f{idx + 1:03d}.png").convert("RGB"),
                            dtype=np.float32)[:, CROP_X0:CROP_X1]
            if tail and i >= len(sel) - tail:
                t = (i - (len(sel) - tail) + 1) / tail
                fr = fr * (1 - t) + idle * t
            if mask_kind:
                # pull the washed-out spinning ball back to red before keying
                _, a0 = cut(fr.copy())
                mask = (_disc_mask(fr.shape[:2], cpb, cfy) if mask_kind == "disc"
                        else _blob_mask(fr, a0))
                fr = recolor(fr, a0, mask)
            fr, a = cut(fr)
            rgba = np.dstack([fr.astype(np.uint8), (a * 255).astype(np.uint8)])
            (Image.fromarray(rgba, "RGBA")
                  .resize((SIZE, SIZE), Image.LANCZOS)
                  .save(os.path.join(out, f"{pfx}{i:02d}.png"), optimize=True))
        print(f"{name}: wrote {len(sel)} frames")


if __name__ == "__main__":
    main()
