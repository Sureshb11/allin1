/**
 * Global font swap → Google Lexend.
 *
 * The app styles text almost entirely with `fontWeight` (900/800/700…) on the
 * system font. Custom fonts on Android don't resolve numeric weights from one
 * family, so we ship nine per-weight Lexend faces (each its own family name) and
 * map every Text/TextInput's resolved `fontWeight` to the matching Lexend face.
 *
 * Elements that already set an explicit `fontFamily` (e.g. vector-icon glyphs)
 * are left untouched, so icons keep rendering correctly.
 *
 * Imported once for its side-effect from index.js, before AppRegistry.
 */
import React from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';

const WEIGHT_TO_FAMILY = {
  '100': 'Lexend-Thin',
  '200': 'Lexend-ExtraLight',
  '300': 'Lexend-Light',
  '400': 'Lexend-Regular',
  '500': 'Lexend-Medium',
  '600': 'Lexend-SemiBold',
  '700': 'Lexend-Bold',
  '800': 'Lexend-ExtraBold',
  '900': 'Lexend-Black',
  normal: 'Lexend-Regular',
  bold: 'Lexend-Bold',
};

const familyForWeight = (weight) =>
  WEIGHT_TO_FAMILY[String(weight)] || 'Lexend-Regular';

// Some fontFamily values are NOT Lexend and must be preserved (icon glyph fonts).
const isIconFamily = (family) =>
  typeof family === 'string' && !family.startsWith('Lexend');

const patch = (Component) => {
  if (Component.__lexendPatched) return;
  const original = Component.render;
  Component.render = function render(...args) {
    const origin = original.apply(this, args);
    if (!origin) return origin;
    const flat = StyleSheet.flatten(origin.props.style) || {};
    // Keep glyph/icon fonts (and any deliberately non-Lexend family) as-is.
    if (isIconFamily(flat.fontFamily)) return origin;
    const family = familyForWeight(flat.fontWeight);
    return React.cloneElement(origin, {
      style: [{ fontFamily: family }, origin.props.style],
    });
  };
  Component.__lexendPatched = true;
};

patch(Text);
patch(TextInput);
