import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';

/**
 * BrandLogo - The standardized "LOCAL LEGENDS" logo component with the star badge.
 * 
 * @param {number} scale - Multiplier for the logo size (default: 1.0)
 * @param {string} textColor - Custom color for the "LOCAL" text (default: DS.text)
 * @param {string} badgeColor - Custom color for the "LEGENDS" badge background (default: DS.primary)
 * @param {string} badgeTextColor - Custom color for the "LEGENDS" text and star (default: DS.bg)
 * @param {object} style - Additional container styles
 */
export default function BrandLogo({ 
  scale = 1, 
  textColor, 
  badgeColor, 
  badgeTextColor,
  style 
}) {
  const { colors } = useTheme();

  const activeTextColor = textColor || colors.textPrimary;
  const activeBadgeColor = badgeColor || colors.lime;
  const activeBadgeTextColor = badgeTextColor || colors.bg;

  return (
    <View style={[styles.headerBrand, style]}>
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
  brandBadge: { 
    flexDirection: 'row', 
    alignItems: 'center',
  },
  brandBadgeText: { 
    fontWeight: '800', 
    letterSpacing: 0.8 
  },
});
