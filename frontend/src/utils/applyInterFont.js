/**
 * Global font swap → Inter (an open-source, SF-Pro-like typeface).
 *
 * The app styles text almost entirely with `fontWeight` on the system font.
 * We inject Inter as the family for every Text/TextInput while KEEPING the
 * element's own `fontWeight`, so the full 100–900 range renders:
 *   • Android → the `inter` res/font family (android/app/src/main/res/font/
 *     inter.xml maps each weight to its .ttf); Android resolves fontWeight
 *     natively. Requires the inter_*.ttf faces + inter.xml.
 *   • iOS → the "Inter" family; CoreText resolves fontWeight across the faces
 *     registered via Info.plist (UIAppFonts).
 *
 * Icon glyph fonts (MaterialCommunityIcons, Ionicons, …) set their own explicit
 * fontFamily and are left untouched — we only override text families (unset, or
 * one of the app's brand text families).
 *
 * Imported once for its side-effect from index.js, before AppRegistry.
 */
import React from 'react';
import { Text, TextInput, StyleSheet, Platform } from 'react-native';

const INTER_FAMILY = Platform.OS === 'android' ? 'inter' : 'Inter';

// Families we DO want to replace with Inter (unset counts too). Anything else
// with an explicit family — icon glyph fonts especially — is preserved.
const TEXT_FAMILY = /^(Inter|Lexend|Hanken|Anybody|System)/i;

const patch = (Component) => {
  if (Component.__interPatched) return;
  const original = Component.render;
  Component.render = function render(...args) {
    const origin = original.apply(this, args);
    if (!origin) return origin;
    const flat = StyleSheet.flatten(origin.props.style) || {};
    const fam = flat.fontFamily;
    // Preserve icon/other explicit non-text families exactly as-is.
    if (fam && !TEXT_FAMILY.test(fam)) return origin;
    // Inject Inter at HIGH priority (after the element's own style) so it also
    // overrides brand text families, while keeping the resolved fontWeight.
    return React.cloneElement(origin, {
      style: [origin.props.style, { fontFamily: INTER_FAMILY }],
    });
  };
  Component.__interPatched = true;
};

patch(Text);
patch(TextInput);
