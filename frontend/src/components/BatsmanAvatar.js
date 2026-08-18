// A batsman, playing the shot.
//
// Not an arrow and not a diagram — a figure in the stance, so the scorer picks
// the cut because it LOOKS like a cut. Twenty-nine options in identical type is
// twenty-nine things to read with the next ball being walked back to the mark;
// twenty-nine postures is something you recognise at a glance.
//
// ── One asset, every theme ──────────────────────────────────────────────────
// The art is a solid black silhouette on transparency, tinted at render time.
// That is why there is no light/dark/sunlight variant of any file: `tintColor`
// paints the whole figure in whatever colour the caller passes, so the same
// PNG is near-white in dark mode, black on the sunlight console, and the tile's
// surface colour when selected. A coloured illustration could not do that.
//
// ── Mirroring ───────────────────────────────────────────────────────────────
// A left-hander's cover drive is the same stroke facing the other way, so the
// whole figure is reflected. This is exactly why the shots are drawn rather
// than photographed: a photo cannot flip without putting the bat in the wrong
// hand, and every one of these has to work for both hands.

import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { shotArt } from '../sports/cricket/shotArt';

const isLeft = (hand) => String(hand || '').toLowerCase().startsWith('l');

export default function BatsmanAvatar({ shotKey, hand = 'right', size = 46, color }) {
  const art = shotArt(shotKey);

  // Strokes with no artwork yet get a neutral mark rather than a near-enough
  // silhouette borrowed from another shot — a square drive wearing the cover
  // drive's picture would teach the scorer to pick the wrong tile at speed.
  // The label underneath carries it until the art lands.
  if (!art) {
    return (
      <View style={[styles.wrap, { width: size, height: size }]}>
        <Icon name="cricket" size={size * 0.62} color={color} style={styles.fallback} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Image
        source={art}
        // `contain` and not `cover`: the silhouettes were exported onto a common
        // baseline inside a square, and cropping would cut the bat off exactly
        // on the strokes whose bat is furthest from the body.
        resizeMode="contain"
        style={[
          { width: size, height: size, tintColor: color },
          isLeft(hand) && styles.mirrored,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  mirrored: { transform: [{ scaleX: -1 }] },
  fallback: { opacity: 0.45 },
});
