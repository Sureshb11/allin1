// ─────────────────────────────────────────────────────────────────────────────
// EventSound — plays the FOUR / SIX / WICKET stinger for a live match.
//
// Mirrors the LiveBall reaction: it watches the same `event` ({type,id}) the
// spectator ball reacts to, and when a big moment lands it plays the matching
// clip once. Implemented with react-native-video (already linked — no extra
// native module) as a zero-size hidden player: keying the <Video> by event id
// remounts it, so the same moment twice (two fours) replays cleanly, and a new
// moment cuts off the previous clip.
//
// Only four/six/wicket carry a sound; runs/over/innings/finished are silent
// (they're not in SFX). There's no in-app mute — the sound is always on, save
// for the phone's own silent switch / volume (iOS silent → no sound).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Video from 'react-native-video';

const SFX = {
  four:   require('../../../assets/sfx/four.mp3'),
  six:    require('../../../assets/sfx/six.mp3'),
  wicket: require('../../../assets/sfx/wicket.mp3'),
};

export default function EventSound({ event, muted = false }) {
  // playing = { key, src }; key restarts playback, null = nothing loaded.
  const [playing, setPlaying] = useState(null);

  useEffect(() => {
    if (!event?.id) return;
    const src = SFX[event.type];
    if (src) setPlaying({ key: event.id, src });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  if (!playing || muted) return null;
  return (
    <Video
      key={playing.key}
      source={playing.src}
      paused={false}
      repeat={false}
      volume={1}
      muted={false}
      playInBackground={false}
      // ignoreSilentSwitch defaults to "inherit" → the iOS silent switch
      // silences it. No in-app mute toggle; the phone's own silent/volume is it.
      onEnd={() => setPlaying(null)}
      onError={() => setPlaying(null)}
      style={styles.hidden}
    />
  );
}

// A real (non-display:none) node so the native player mounts, but 1×1 and
// transparent so it never affects layout or intercepts touches.
const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, bottom: 0, left: 0 },
});
