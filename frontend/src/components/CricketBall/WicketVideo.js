// ─────────────────────────────────────────────────────────────────────────────
// WicketVideo — full-screen WICKET moment (assets/ball/ball_wicket.mp4, 5.5s,
// with sound). The live spectator screen no longer uses this (it plays the
// inline WicketBall instead); it survives as the Ball Lab preview.
// Tap anywhere to skip, auto-dismisses on end (or on any playback error).
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { View, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import Video from 'react-native-video';

const SRC = require('../../../assets/ball/ball_wicket.mp4');

export default function WicketVideo({ visible, onDone }) {
  if (!visible) return null;
  return (
    <TouchableWithoutFeedback onPress={onDone} accessibilityLabel="Skip wicket animation">
      <View style={styles.wrap}>
        <Video
          source={SRC}
          style={styles.video}
          resizeMode="contain"
          muted={false}
          volume={1}
          ignoreSilentSwitch="ignore"
          onEnd={onDone}
          onError={onDone}
        />
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,4,10,0.92)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 999, elevation: 999,
  },
  video: { width: '100%', aspectRatio: 1 },
});
