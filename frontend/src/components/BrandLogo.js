import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';

// The brand, in one place. Import these rather than retyping the words — a
// tagline that drifts ("Where legends are born" / "…are Born") stops reading as
// a brand and starts reading as a typo.
export const BRAND_NAME = 'Local Legends';
export const BRAND_TAGLINE = 'Where Legends Are Born';

/**
 * BrandLogo - The standardized "LOCAL LEGENDS" logo component with the star badge.
 *
 * @param {number} scale - Multiplier for the logo size (default: 1.0)
 * @param {string} textColor - Custom color for the "LOCAL" text (default: DS.text)
 * @param {string} badgeColor - Custom color for the "LEGENDS" badge background (default: DS.primary)
 * @param {string} badgeTextColor - Custom color for the "LEGENDS" text and star (default: DS.bg)
 * @param {boolean} tagline - Show "Where Legends Are Born" beneath the wordmark.
 *   Opt-in, for brand moments (splash, sign-in) — NOT the compact logo that sits
 *   in every screen header, where a tagline on all 20 screens is just clutter.
 * @param {object} style - Additional container styles
 */
export default function BrandLogo({
  scale = 1,
  textColor,
  badgeColor,
  badgeTextColor,
  tagline = false,
  style
}) {
  const { colors } = useTheme();

  const activeTextColor = textColor || colors.textPrimary;
  const activeBadgeColor = badgeColor || colors.lime;
  const activeBadgeTextColor = badgeTextColor || colors.bg;

  // With a tagline the mark becomes a stacked block (wordmark over tagline);
  // without one it stays the inline row every header already lays out.
  const mark = (
    <View style={styles.headerBrand}>
      <Text allowFontScaling={false} style={[styles.brandText, { color: activeTextColor, fontSize: 20 * scale }]}>LOCAL</Text>
      <View style={[
        styles.brandBadge, 
        { 
          backgroundColor: activeBadgeColor,
          paddingHorizontal: 9 * scale, 
          paddingVertical: 3 * scale, 
          borderRadius: 8 * scale 
        }
      ]}>
        <Icon 
          name="star-four-points" 
          size={10 * scale} 
          color={activeBadgeTextColor} 
          style={{ marginRight: 3 * scale }} 
        />
        <Text allowFontScaling={false} style={[styles.brandBadgeText, { color: activeBadgeTextColor, fontSize: 13 * scale }]}>LEGENDS</Text>
      </View>
    </View>
  );

  if (!tagline) return <View style={style}>{mark}</View>;
  return (
    <View style={style}>
      {mark}
      <Text allowFontScaling={false}
        style={[styles.tagline, { color: activeTextColor, fontSize: 11 * scale, marginTop: 6 * scale }]}>
        {BRAND_TAGLINE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBrand: { 
    flexDirection: 'row', 
    alignItems: 'center',
    marginRight: 'auto'
  },
  brandText: {
    fontWeight: '800',
    letterSpacing: 1.5,
    marginRight: 6
  },
  // Wide letter-spacing + low opacity: it should sit under the wordmark as a
  // whisper, not compete with it.
  tagline: {
    fontWeight: '700',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    opacity: 0.55,
  },
  brandBadge: { 
    flexDirection: 'row', 
    alignItems: 'center',
  },
  brandBadgeText: { 
    fontWeight: '800', 
    letterSpacing: 0.8 
  },
});
