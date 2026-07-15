// ─────────────────────────────────────────────────────────────────────────────
// WicketVideo — full-screen WICKET moment (assets/ball/wicket.mp4, 8s, with
// sound). Plays once when a wicket falls on the live spectator screen;
// tap anywhere to skip, auto-dismisses on end (or on any playback error).
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { View, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import Video from 'react-native-video';

const SRC = require('../../../assets/ball/wicket.mp4');

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
  video: { width: '100%', aspectRatio: 16 / 9 },
});
