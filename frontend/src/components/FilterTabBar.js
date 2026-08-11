import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// A flat, text-based tab bar with an active underline indicator.
// Replaces the pill-shaped SegmentedControl for top-level filters like Ball Type.
export default function FilterTabBar({ options, value, onChange, style }) {
  const { colors: DS } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: DS.border }, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <TouchableOpacity
              key={o.id}
              style={[styles.tab, on && { borderBottomColor: DS.lime }]}
              activeOpacity={0.8}
              onPress={() => { if (o.id !== value) onChange(o.id); }}
            >
              <Text style={[styles.label, { color: on ? DS.lime : DS.textMuted, fontWeight: on ? '800' : '600' }]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
  },
  scrollContent: {
    gap: 24,
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  label: {
    fontSize: 12,
    letterSpacing: 0.5,
  }
});
