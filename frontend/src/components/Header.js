import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { Spacing, Radius } from '../theme';
import BrandLogo from './BrandLogo';

const Header = ({ title, onSearchPress, onNotificationsPress, onMenuPress }) => {
  const { colors: DS, typography } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: DS.surfaceLow }]}>
      {onMenuPress ? (
        <TouchableOpacity style={styles.iconBtn} onPress={onMenuPress}>
          <Icon name="menu" size={24} color={DS.textInverse} />
        </TouchableOpacity>
      ) : (
        <View style={styles.brand}>
          {title ? (
            <>
              <Icon name="cricket" size={20} color={DS.lime} />
              <Text style={[styles.brandText, typography.h4, { color: DS.textInverse }]}>{title}</Text>
            </>
          ) : (
            <BrandLogo scale={0.75} />
          )}
        </View>
      )}

      {onMenuPress && (
        <View style={styles.brand}>
          {title ? (
            <>
              <Icon name="cricket" size={20} color={DS.lime} />
              <Text style={[styles.brandText, typography.h4, { color: DS.textInverse }]}>{title}</Text>
            </>
          ) : (
            <BrandLogo scale={0.75} />
          )}
        </View>
      )}

      <View style={styles.actions}>
        {onSearchPress && (
          <TouchableOpacity style={styles.iconBtn} onPress={onSearchPress}>
            <Icon name="magnify" size={22} color={DS.textInverse} />
          </TouchableOpacity>
        )}
        {onNotificationsPress && (
          <TouchableOpacity style={styles.iconBtn} onPress={onNotificationsPress}>
            <Icon name="bell-outline" size={22} color={DS.textInverse} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
