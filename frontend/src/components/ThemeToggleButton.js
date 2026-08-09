import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { haptic } from '../utils/haptics';

export default function ThemeToggleButton({ style }) {
  const { toggle, isDark, colors } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.btn, style]}
      activeOpacity={0.8}
      onPress={() => {
        haptic.tick();
        toggle();
      }}
    >
      <Icon name={isDark ? 'white-balance-sunny' : 'weather-night'} size={24} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    padding: 8,
    borderRadius: 24,
    backgroundColor: 'rgba(128,128,128,0.1)',
  }
});
