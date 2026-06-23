import { useTheme, useThemedStyles } from "../theme/ThemeContext";import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';






const SCREEN_ICONS = {
  'Live Scores': 'scoreboard-outline',
  'My Matches': 'cricket',
  'Tournaments': 'trophy-outline',
  'Statistics': 'chart-bar',
  'My Performance': 'chart-line',
  'Streaming': 'broadcast',
  'Marketplace': 'store-outline',
  'Chat': 'message-outline',
  'Profile': 'account-outline'
};

const PlaceholderScreen = ({ route, navigation }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const { title = 'Coming Soon' } = route.params || {};
  const iconName = SCREEN_ICONS[title] || 'tools';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconRing}>
          <Icon name={iconName} size={48} color={DS.lime} />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          We're working hard to bring this feature to you. Stay tuned for updates!
        </Text>

        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Under Development</Text>
        </View>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}>
          
          <Icon name="arrow-left" size={18} color={DS.bg} style={{ marginRight: 6 }} />
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </View>);

};

const makeStyles = (DS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },
  header: {
    backgroundColor: DS.surfaceLow, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: 44, paddingBottom: 10
  },
  backBtn: { width: 40, height: 40, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: DS.textPrimary },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  iconRing: {
    width: 108, height: 108, borderRadius: 999, backgroundColor: DS.surfaceHigh,
    justifyContent: 'center', alignItems: 'center', marginBottom: 24
  },
  title: { fontSize: 22, fontWeight: '900', color: DS.textPrimary, marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 15, color: DS.textVariant, textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, gap: 6, marginBottom: 32
  },
  statusDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: '#f59e0b' },
  statusText: { fontSize: 12, fontWeight: '700', color: '#f59e0b', letterSpacing: 0.5 },
  backButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: DS.lime,
    paddingHorizontal: 24, paddingVertical: 13, borderRadius: 12
  },
  backButtonText: { fontSize: 14, fontWeight: '700', color: DS.bg }
});

export default PlaceholderScreen;