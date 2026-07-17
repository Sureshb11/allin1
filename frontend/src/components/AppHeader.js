import React from 'react';
import { View, TouchableOpacity, StyleSheet, Image } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useCurrentUser } from '../utils/currentUser';
import BrandLogo from './BrandLogo';

export default function AppHeader({ onComposePress, showCompose = false, hideProfileIcon = false }) {
  const navigation = useNavigation();
  const DS = useTheme().colors;
  const meUser = useCurrentUser();

  return (
    <View style={[styles.topBar, { borderBottomColor: DS.border, backgroundColor: DS.surfaceLow }]}>
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
          <TouchableOpacity hitSlop={8} onPress={onComposePress}>
            <Icon name="plus-box-outline" size={24} color={DS.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}

        {/* Notifications */}
        <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('Notification')}>
          <Icon name="bell-outline" size={22} color={DS.textPrimary} />
        </TouchableOpacity>

        {/* Profile */}
        {!hideProfileIcon && (
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('ProfileTab')}>
            {meUser?.avatarUrl ? (
              <Image source={{ uri: meUser.avatarUrl }} style={[styles.avatar, { backgroundColor: DS.surfaceHighest }]} />
            ) : (
              <Icon name="account-circle-outline" size={26} color={DS.textPrimary} />
            )}
          </TouchableOpacity>
        )}
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
