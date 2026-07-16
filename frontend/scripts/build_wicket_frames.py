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
from scipy.ndimage import binary_fill_holes, binary_closing
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

# (out dir, clip file, first, last, step, frame prefix, tail-dissolve frames)
CLIPS = [
    ("wicket_frames", "wicket.mp4",    24, 169, 2, "w", 0),
    ("four_frames",   "ball_four.mp4", 14, 189, 2, "f", 0),
    ("six_frames",    "ball_six.mp4",  27, 192, 2, "s", 10),
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


def main():
    for name, clip, lo, hi, step, pfx, tail in CLIPS:
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
            fr, a = cut(fr)
            rgba = np.dstack([fr.astype(np.uint8), (a * 255).astype(np.uint8)])
            (Image.fromarray(rgba, "RGBA")
                  .resize((SIZE, SIZE), Image.LANCZOS)
                  .save(os.path.join(out, f"{pfx}{i:02d}.png"), optimize=True))
        print(f"{name}: wrote {len(sel)} frames")


if __name__ == "__main__":
    main()
