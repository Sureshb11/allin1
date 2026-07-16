#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────────
# build_wicket_frames.py — turn assets/ball/wicket.mp4 into the transparent PNG
# sequence the live spectator screen plays in place of the ball on a wicket.
#
# What it does:
#   · reads the mp4 (the signature ball shattering in a red spark burst)
#   · keys the near-black background to alpha (distance-from-bg matte) so the
#     clip drops onto any background with no visible box
#   · crops square around the (centred) ball, trims idle lead-in/tail so the
#     sequence starts and ends on the idle ball, and downscales
#   · writes assets/ball/wicket_frames/wNN.png  (then run pngquant to shrink)
#
# If you change the clip, re-run this, then:
#   pngquant --quality=55-88 --ext .png --force --speed 1 \
#            frontend/assets/ball/wicket_frames/w*.png
# and regenerate the require() manifest in
#   src/components/CricketBall/wicketFrames.js  (one entry per wNN.png).
#
# Deps:  pip install imageio imageio-ffmpeg av pillow numpy
# ─────────────────────────────────────────────────────────────────────────────
import os
import numpy as np
import imageio.v3 as iio
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "assets", "ball"))
SRC = os.path.join(ASSETS, "wicket.mp4")
OUT = os.path.join(ASSETS, "wicket_frames")

# Tuned for the current clip (1280x720, 24fps, ball centred at x=640, top~194,
# diameter ~410 on a ~(16,16,21) background).
BG        = np.array([16, 16, 21], dtype=np.float32)
KEY_LO    = 55.0    # matte ramp: distance from BG that starts to become opaque
KEY_HI    = 120.0   # …and where it is fully opaque
KEY_GAMMA = 1.2     # >1 hardens the edge (cleaner over white)
CROP      = (280, 1000, 0, 720)   # x0, x1, y0, y1 — square, ball centred
FRAME_LO, FRAME_HI, STEP = 24, 169, 2   # idle→idle window, every other frame
SIZE      = 200     # output edge in px (retina for a ~56px on-screen ball)


def key_alpha(fr):
    d = np.sqrt(((fr.astype(np.float32) - BG) ** 2).sum(axis=2))
    return np.clip((d - KEY_LO) / (KEY_HI - KEY_LO), 0, 1) ** KEY_GAMMA


def main():
    frames = iio.imread(SRC, plugin="pyav")
    os.makedirs(OUT, exist_ok=True)
    for fn in os.listdir(OUT):
        os.remove(os.path.join(OUT, fn))
    x0, x1, y0, y1 = CROP
    sel = list(range(FRAME_LO, FRAME_HI, STEP))
    for i, idx in enumerate(sel):
        fr = frames[idx]
        a = (key_alpha(fr) * 255).astype(np.uint8)
        rgba = np.dstack([fr, a])[y0:y1, x0:x1]
        (Image.fromarray(rgba, "RGBA")
              .resize((SIZE, SIZE), Image.LANCZOS)
              .save(os.path.join(OUT, f"w{i:02d}.png"), optimize=True))
    print(f"wrote {len(sel)} frames to {OUT}")


if __name__ == "__main__":
    main()
