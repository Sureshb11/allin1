import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getSelectedSport } from '../utils/selectedSport';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

const { width } = Dimensions.get('window');
const SIDEBAR_WIDTH = Math.min(width * 0.82, 320);

const MENU_SECTIONS = [
  {
    title: 'Play',
    items: [
      { id: 'start-match',  label: 'Start a Match',         icon: 'cricket',        screen: 'StartMatch' },
      { id: 'my-matches',   label: 'My Matches',            icon: 'format-list-bulleted', screen: 'MyMatches' },
      { id: 'tournament',   label: 'Tournaments / Series',  icon: 'trophy-outline', screen: 'Tournaments' },
    ],
  },
  {
    title: 'Performance',
    items: [
      { id: 'performance',  label: 'My Performance',        icon: 'chart-line',     screen: 'MyPerformance' },
      { id: 'stats',        label: 'Player Leaderboard',    icon: 'podium',         screen: 'Statistics' },
      { id: 'awards',       label: 'Awards & Badges',       icon: 'trophy-variant', screen: 'BadgeDetail' },
      { id: 'challenges',   label: 'Challenges',            icon: 'target',         screen: 'Quiz' },
    ],
  },
  {
    title: 'Explore',
    items: [
      { id: 'go-live',      label: 'Go Live',               icon: 'broadcast',      screen: 'StreamingLanding' },
      { id: 'looking-for',  label: 'Looking For',           icon: 'telescope',      screen: 'LookingFor' },
      { id: 'coaching',     label: 'Find a Coach',          icon: 'school',         screen: 'Coaching' },
      { id: 'umpires',      label: 'Find an Umpire',        icon: 'whistle',        screen: 'Umpires' },
      { id: 'store',        label: 'Cricket Store',         icon: 'store-outline',  screen: 'MarketPlace' },
    ],
  },
];

const SimpleSidebar = ({ visible, onClose, navigation }) => {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const navigate = (screen) => {
    onClose();
    navigation.navigate(screen);
  };

  // Sport-aware menu: same sections for every sport, but labels/icons reflect the
  // active sport (e.g. Start-Match icon, "<Sport> Store").
  const sport = getSelectedSport().sport || { name: 'Cricket', icon: 'cricket' };
  const sections = MENU_SECTIONS.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      if (item.id === 'start-match') return { ...item, icon: sport.icon || 'whistle' };
      if (item.id === 'store')       return { ...item, label: `${sport.name} Store` };
      return item;
    }),
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sidebar}>
          {/* ── Profile Header ─────────────────────────────── */}
          <View style={styles.sidebarHeader}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Icon name="close" size={20} color={DS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* ── Menu Sections ──────────────────────────────── */}
          <ScrollView style={styles.menuScroll} showsVerticalScrollIndicator={false}>
            {sections.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.items.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.menuItem}
                    onPress={() => navigate(item.screen)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.menuIconWrap}>
                      <Icon name={item.icon} size={20} color={DS.textVariant} />
                    </View>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    {item.badge && (
                      <View style={[styles.badge, { backgroundColor: item.badgeColor }]}>
                        <Text style={styles.badgeText}>{item.badge}</Text>
                      </View>
                    )}
                    <Icon name="chevron-right" size={16} color={DS.faint} />
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>

        {/* Tap-outside to close */}
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
      </View>
    </Modal>
  );
};

const makeStyles = (DS) => StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    height: '100%',
    backgroundColor: DS.surfaceLow,
    order: -1,
    elevation: 16,
  },

  // ── Profile section ─────────────────────────────────────
  sidebarHeader: {
    height: 56,
    backgroundColor: DS.bg,
  },
  profileSection: {
    backgroundColor: DS.bg,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 20,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: DS.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarWrap: {
    alignSelf: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: DS.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  premiumBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: DS.lime,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: DS.textPrimary,
    textAlign: 'center',
    marginBottom: 2,
  },
  userId: {
    fontSize: 12,
    color: DS.textMuted,
    textAlign: 'center',
    marginBottom: 10,
  },
  premiumTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    backgroundColor: 'rgba(171,214,0,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  premiumTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: DS.lime,
    letterSpacing: 0.5,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: DS.surfaceHighest,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: DS.lime,
    borderRadius: 999,
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: DS.textMuted,
    flexShrink: 1,
    letterSpacing: 0.3,
  },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: DS.lime,
    paddingVertical: 10,
    borderRadius: 12,
  },
  profileBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: DS.bg,
  },

  // ── Menu ────────────────────────────────────────────────
  menuScroll: {
    flex: 1,
  },
  section: {
    paddingTop: 6,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: DS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    paddingBottom: 6,
    paddingTop: 10,
    marginBottom: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 10,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: DS.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: DS.textPrimary,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: DS.bg,
    letterSpacing: 0.5,
  },
});

export default SimpleSidebar;
