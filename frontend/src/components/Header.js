import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors, Typography, Spacing, Radius } from '../theme';

const Header = ({ title, onSearchPress, onNotificationsPress, onMenuPress }) => (
  <View style={styles.container}>
    {onMenuPress ? (
      <TouchableOpacity style={styles.iconBtn} onPress={onMenuPress}>
        <Icon name="menu" size={24} color={Colors.textInverse} />
      </TouchableOpacity>
    ) : (
      <View style={styles.brand}>
        <Icon name="cricket" size={20} color={Colors.primary} />
        <Text style={styles.brandText}>{title || 'Local Legends'}</Text>
      </View>
    )}

    {onMenuPress && (
      <View style={styles.brand}>
        <Icon name="cricket" size={20} color={Colors.primary} />
        <Text style={styles.brandText}>{title || 'Local Legends'}</Text>
      </View>
    )}

    <View style={styles.actions}>
      {onSearchPress && (
        <TouchableOpacity style={styles.iconBtn} onPress={onSearchPress}>
          <Icon name="magnify" size={22} color={Colors.textInverse} />
        </TouchableOpacity>
      )}
      {onNotificationsPress && (
        <TouchableOpacity style={styles.iconBtn} onPress={onNotificationsPress}>
          <Icon name="bell-outline" size={22} color={Colors.textInverse} />
        </TouchableOpacity>
      )}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.secondary,
    paddingHorizontal: Spacing.sm,
    paddingTop: 44,
    paddingBottom: Spacing.sm,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
    justifyContent: 'center',
  },
  brandText: {
    ...Typography.h4,
    color: Colors.textInverse,
    letterSpacing: 0.3,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default Header;
