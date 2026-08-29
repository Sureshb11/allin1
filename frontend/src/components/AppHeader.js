import React from 'react';
import { View, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useCurrentUser } from '../utils/currentUser';
import { useUnreadCount } from '../utils/unreadCount';
import BrandLogo from './BrandLogo';
import HexAvatar from './HexAvatar';
import { Text } from 'react-native';

export default function AppHeader({ onComposePress, showCompose = false, transparent = false }) {
  const navigation = useNavigation();
  const { colors: DS, isDark } = useTheme();
  // The header clears the status bar itself.
  //
  // topBar had a flat paddingTop of 16, which only works while the app draws
  // BELOW the status bar. PavilionScreen sets <StatusBar translucent />, and
  // that is a global, imperative setting on Android — it stays applied after
  // that screen goes away. So the moment Pavilion had mounted once (it is the
  // neighbour of "You", and the pager renders neighbours), every screen started
  // drawing under the clock, and a 16pt header went with it.
  //
  // Pavilion was the only one of the four screens using this header that padded
  // for the inset, from the outside. Owning it here fixes the other three and
  // means the header sits right whatever the status bar is doing.
  const insets = useSafeAreaInsets();
  const unread = useUnreadCount();

  return (
    <View style={[styles.topBar, {
      paddingTop: insets.top + 12,
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

        {/* Notifications, with the count the server has always returned and
            nothing ever drew. Capped at 99+: the badge sits on a 24pt icon and
            a four-digit number would be wider than the bell it belongs to. */}
        <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('Notification')}
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}>
          <Icon name="bell-outline" size={24} color={DS.textPrimary} />
          {unread > 0 && (
            <View style={[styles.badge, { backgroundColor: DS.live || '#EF4444', borderColor: transparent ? 'transparent' : DS.surfaceLow }]}>
              <Text style={styles.badgeTxt} numberOfLines={1}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </TouchableOpacity>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits on the bell's top-right corner, overlapping it the way every unread
  // badge does. The border is the header's own colour, so the badge reads as
  // lifted off the icon rather than fused to it.
  badge: {
    position: 'absolute', top: -5, right: -7,
    minWidth: 17, height: 17, borderRadius: 9, borderWidth: 2,
    paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
  },
  badgeTxt: { color: '#fff', fontSize: 9.5, fontWeight: '900', fontVariant: ['tabular-nums'] },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // paddingTop is set inline from the safe-area inset — a constant here would
    // be silently overridden, which is how you end up debugging a number that
    // never applied.
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
