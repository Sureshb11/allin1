import React from 'react';
import { View, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useCurrentUser } from '../utils/currentUser';
import BrandLogo from './BrandLogo';
import HexAvatar from './HexAvatar';
import { Text } from 'react-native';

export default function AppHeader({ onComposePress, showCompose = false, transparent = false }) {
  const navigation = useNavigation();
  const { colors: DS, isDark } = useTheme();

  return (
    <View style={[styles.topBar, {
      borderBottomColor: isDark ? 'transparent' : DS.border,
      borderBottomWidth: isDark ? 0 : 1,
      backgroundColor: transparent ? 'transparent' : DS.surfaceLow,
      ...(isDark && !transparent ? {
        shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 }, elevation: 6,
      } : {}),
    }]}>
      {/* Brand Logo - Matches Feeds screen */}
      <TouchableOpacity 
        activeOpacity={1} 
        disabled={!__DEV__}
        onLongPress={() => {
          if (__DEV__) {
            try { navigation.navigate('BallLab'); } catch (e) {}
          }
        }}
      >
        <BrandLogo />
      </TouchableOpacity>

      {/* Right Icons */}
      <View style={styles.topActions}>
        {/* Compose Icon or Spacer */}
        {showCompose ? (
          <TouchableOpacity 
            hitSlop={8} 
            onPress={onComposePress}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: DS.surfaceHigh, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: DS.lime + '40' }}
          >
            <Icon name="plus" size={16} color={DS.lime} />
            <Text style={{ color: DS.lime, fontWeight: '800', fontSize: 13, letterSpacing: 0.5 }}>Post</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}

        {/* Chats — sits next to notifications because it's the same kind of
            thing: something waiting for you. Shared header, so every screen
            using it gets the entry point, not just Scout. */}
        <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('Chats')}>
          <Icon name="chat-outline" size={24} color={DS.textPrimary} />
        </TouchableOpacity>

        {/* Notifications */}
        <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('Notification')}>
          <Icon name="bell-outline" size={24} color={DS.textPrimary} />
        </TouchableOpacity>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
});
