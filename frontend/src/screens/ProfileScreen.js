import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Share, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import SportSwitcher from '../components/SportSwitcher';
import { getSelectedSport } from '../utils/selectedSport';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

// Sport-aware profile stats: which stored-stat fields to surface per sport (first 4
// present are shown). Anything not listed falls back to DEFAULT_FIELDS.
const SPORT_STAT_FIELDS = {
  cricket:  [['matches', 'Matches'], ['runs', 'Runs'], ['wickets', 'Wickets'], ['strikeRate', 'Strike Rate'], ['average', 'Average'], ['momCount', 'MOM']],
  football: [['matches', 'Matches'], ['goals', 'Goals'], ['assists', 'Assists'], ['cleanSheets', 'Clean Sheets'], ['saves', 'Saves']],
};
const DEFAULT_STAT_FIELDS = [['matches', 'Matches'], ['events', 'Events'], ['fights', 'Fights'], ['wins', 'Wins'], ['titles', 'Titles'], ['ko', 'KO'], ['goals', 'Goals']];

const MENU_ITEMS = [
  { id: 'edit-profile',   title: 'Edit Profile',          icon: 'account-edit',   screen: 'EditPlayerProfile' },
  { id: 'edit-team',      title: 'Team Profile',           icon: 'account-group',  screen: 'EditTeamProfile' },
  { id: 'club-profile',   title: 'Club Profile',           icon: 'domain',         screen: 'ClubProfile' },
  { id: 'services',       title: 'Services Profile',       icon: 'cog',            screen: 'ServicesProfile' },
  { id: 'badges',         title: 'Badges & Achievements',  icon: 'trophy',         screen: 'BadgeDetail' },
  { id: 'insights',       title: 'Player Insights',        icon: 'chart-line',     screen: 'PlayerInsights' },
  { id: 'premium',        title: 'Premium Features',       icon: 'star-circle-outline', screen: 'Premium' },
  { id: 'notifications',  title: 'Notifications',          icon: 'bell',           screen: 'Notification' },
  { id: 'help',           title: 'Help & FAQs',            icon: 'help-circle',    screen: 'HelpFAQs' },
  { id: 'contact',        title: 'Contact Us',             icon: 'phone',          screen: 'ContactUs' },
];

export default function ProfileScreen({ navigation }) {
  const { colors: DS, pref, setMode } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [profile, setProfile] = useState({});
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Profile',
    });
  }, [navigation]);

  const BentoStat = ({ label, value, accent = false }) => (
    <View style={[styles.bentoCard, accent && styles.bentoCardAccent]}>
      <Text style={[styles.bentoValue, accent && styles.bentoValueAccent]}>{value ?? '—'}</Text>
      <Text style={[styles.bentoLabel, accent && styles.bentoLabelAccent]}>{label}</Text>
    </View>
  );

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const [profileRes, statsRes] = await Promise.all([
        legendsApi.getUserProfile(),
        legendsApi.getUserStats(),
      ]);
      if (profileRes.success) setProfile(profileRes.data);
      if (statsRes.success) setStats(statsRes.data);
    } catch {
      Alert.alert('Error', 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  const shareProfile = async () => {
    const sp = getSelectedSport().sport || { name: 'Cricket' };
    const name = profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Player';
    const fields = SPORT_STAT_FIELDS[getSelectedSport().sport?.id] || DEFAULT_STAT_FIELDS;
    const line = fields
      .filter(([k]) => typeof stats[k] === 'number')
      .slice(0, 3)
      .map(([k, label]) => `${stats[k]} ${label.toLowerCase()}`)
      .join(' | ');
    try {
      await Share.share({
        message: `🏆 ${name} on Local Legends · ${sp.name}\n` +
          (line ? `📊 ${line}\n` : '') +
          `Track ${sp.name} on the Local Legends app!`,
      });
    } catch {}
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => {
          await legendsApi.logout();                       // clear persisted JWT
          // Reset the ROOT navigator back to the auth flow.
          const root = navigation.getParent('RootStack') || navigation;
          root.reset({ index: 0, routes: [{ name: 'Auth' }] });
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>
    );
  }

  const displayName = profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Your Name';
  const initials = (displayName === 'Your Name' ? 'U' : displayName)
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const isPremium = profile.plan === 'pro';
  const recentForm = stats.recentForm || [];

  // Sport-aware stat cards (same layout for every sport, fields adapt to the sport).
  const sport = getSelectedSport().sport || { id: 'cricket', name: 'Cricket' };
  const statFields = SPORT_STAT_FIELDS[sport.id] || DEFAULT_STAT_FIELDS;
  const statCards = statFields
    .filter(([k]) => typeof stats[k] === 'number')
    .slice(0, 4)
    .map(([k, label]) => ({ label, value: stats[k] }));

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Hero Header */}
      <View style={styles.hero}>
        <View style={styles.heroInner}>
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            {stats.momCount > 0 && (
              <View style={styles.momBadge}>
                <Icon name="star" size={10} color={DS.bg} />
              </View>
            )}
          </View>

          <View style={styles.heroInfo}>
            <Text style={styles.heroName}>{displayName}</Text>
            {!!profile.phone && <Text style={styles.heroPhone}>{profile.phone}</Text>}
            <Text style={styles.heroRole}>{profile.role || 'Player'}</Text>
            <View style={styles.heroPills}>
              <View style={styles.membershipPill}>
                <Icon name="star-circle" size={11} color={isPremium ? DS.lime : DS.textMuted} />
                <Text style={[styles.membershipText, isPremium && { color: DS.lime }]}>
                  {isPremium ? 'Premium User' : 'Free Plan'}
                </Text>
              </View>
              {profile.teamName && (
                <View style={styles.teamPill}>
                  <Icon name="shield" size={10} color={DS.lime} />
                  <Text style={styles.teamPillText}>{profile.teamName}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Bento Stats Grid — sport-aware */}
        {statCards.length > 0 && (
          <View style={styles.bentoGrid}>
            {statCards.map((c, i) => (
              <BentoStat key={c.label} label={c.label} value={c.value} accent={i >= 2} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.body}>
        {/* Recent Form */}
        {recentForm.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>RECENT FORM</Text>
            {recentForm.map((match, i) => (
              <View key={i} style={styles.formRow}>
                <View style={[styles.resultDot, {
                  backgroundColor: match.result === 'W' ? DS.lime : DS.live,
                }]} />
                <View style={styles.formInfo}>
                  <Text style={styles.formOpponent} numberOfLines={1}>
                    vs {match.opponent || 'Unknown'}
                  </Text>
                  <Text style={styles.formDetail}>
                    {match.runs != null ? `${match.runs} runs` : ''}
                    {match.runs != null && match.wickets != null ? ' · ' : ''}
                    {match.wickets != null ? `${match.wickets}w` : ''}
                  </Text>
                </View>
                {match.isMOM && (
                  <View style={styles.momChip}>
                    <Icon name="star" size={10} color={DS.bg} />
                    <Text style={styles.momChipText}>MOM</Text>
                  </View>
                )}
                <Text style={[styles.formResult, {
                  color: match.result === 'W' ? DS.lime : DS.live,
                }]}>{match.result === 'W' ? 'Won' : 'Lost'}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Share Profile */}
        <TouchableOpacity style={styles.shareBtn} onPress={shareProfile}>
          <Icon name="whatsapp" size={20} color="#fff" />
          <Text style={styles.shareBtnText}>Share Profile on WhatsApp</Text>
        </TouchableOpacity>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('EditPlayerProfile')}
          >
            <Icon name="account-edit" size={18} color={DS.lime} />
            <Text style={styles.quickBtnText}>Edit Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('PlayerInsights')}
          >
            <Icon name="chart-line" size={18} color={DS.blue} />
            <Text style={styles.quickBtnText}>Insights</Text>
          </TouchableOpacity>
        </View>

        {/* Sport switcher */}
        <View style={styles.sportSwitchWrap}>
          <SportSwitcher navigation={navigation} />
        </View>

        {/* Appearance */}
        <View style={styles.appearanceCard}>
          <View style={styles.appearanceHead}>
            <Icon name="theme-light-dark" size={18} color={DS.lime} />
            <Text style={styles.appearanceTitle}>Appearance</Text>
          </View>
          <View style={styles.segment}>
            {[
              { key: 'system', label: 'System', icon: 'cellphone' },
              { key: 'light',  label: 'Light',  icon: 'white-balance-sunny' },
              { key: 'dark',   label: 'Dark',   icon: 'weather-night' },
            ].map((opt) => {
              const active = pref === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  activeOpacity={0.85}
                  onPress={() => setMode(opt.key)}
                >
                  <Icon name={opt.icon} size={16} color={active ? DS.bg : DS.textMuted} />
                  <Text style={[styles.segmentTxt, active && styles.segmentTxtActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuCard}>
          {MENU_ITEMS.map((item, i) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.menuItem, i < MENU_ITEMS.length - 1 && styles.menuItemDivider]}
              onPress={() => navigation.navigate(item.screen)}
            >
              <View style={styles.menuLeft}>
                <View style={styles.menuIconWrap}>
                  <Icon name={item.icon} size={18} color={DS.lime} />
                </View>
                <Text style={styles.menuTitle}>{item.title}</Text>
              </View>
              <Icon name="chevron-right" size={18} color={DS.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Icon name="logout" size={18} color={DS.live} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },

  // Hero
  hero: { backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 20, paddingHorizontal: 16 },
  heroInner: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: DS.surfaceHighest,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '900', color: DS.lime },
  momBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: DS.lime,
    alignItems: 'center', justifyContent: 'center',
  },
  heroInfo: { flex: 1, gap: 2 },
  heroName: { fontSize: 22, fontWeight: '800', color: DS.textPrimary },
  heroPhone: { fontSize: 13, color: DS.textVariant, marginTop: 1 },
  heroRole: { fontSize: 13, color: DS.textMuted, marginTop: 1 },
  heroPills: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  membershipPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.surfaceHigh, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  membershipText: { fontSize: 11, color: DS.textMuted, fontWeight: '700' },
  teamPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.surfaceHigh,
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10, marginTop: 4,
  },
  teamPillText: { fontSize: 11, color: DS.textVariant, fontWeight: '600' },

  // Bento grid
  bentoGrid: { flexDirection: 'row', gap: 8 },
  bentoCard: {
    flex: 1, backgroundColor: DS.surfaceHigh,
    borderRadius: 12, padding: 12, alignItems: 'center',
  },
  bentoCardAccent: { backgroundColor: DS.surfaceHighest },
  bentoValue: { fontSize: 22, fontWeight: '900', color: DS.textPrimary },
  bentoValueAccent: { color: DS.lime },
  bentoLabel: { fontSize: 10, color: DS.textMuted, marginTop: 2, textAlign: 'center' },
  bentoLabelAccent: { color: DS.textVariant },

  // Extra stats
  extraStatsRow: {
    flexDirection: 'row', marginTop: 10, gap: 8,
    paddingTop: 10,
  },
  extraStat: { flex: 1, alignItems: 'center' },
  extraVal: { fontSize: 16, fontWeight: '800', color: DS.textPrimary },
  extraLbl: { fontSize: 10, color: DS.textMuted, marginTop: 1 },

  body: { padding: 16, gap: 12 },

  // Recent form
  section: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16, gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: DS.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  resultDot: { width: 8, height: 8, borderRadius: 4 },
  formInfo: { flex: 1 },
  formOpponent: { fontSize: 13, fontWeight: '600', color: DS.textPrimary },
  formDetail: { fontSize: 11, color: DS.textVariant, marginTop: 1 },
  momChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: DS.lime, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  momChipText: { fontSize: 9, fontWeight: '800', color: DS.bg },
  formResult: { fontSize: 12, fontWeight: '700', minWidth: 30, textAlign: 'right' },

  // Share
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#25D366', borderRadius: 16,
    paddingVertical: 14,
  },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Quick actions
  quickRow: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: DS.surfaceHigh, borderRadius: 16,
    paddingVertical: 12,
  },
  quickBtnText: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },

  // Appearance
  appearanceCard: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16, gap: 12 },
  appearanceHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appearanceTitle: { fontSize: 14, fontWeight: '700', color: DS.textPrimary },
  segment: { flexDirection: 'row', backgroundColor: DS.surfaceLow, borderRadius: 12, padding: 4, gap: 4 },
  segmentBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: 9,
  },
  segmentBtnActive: { backgroundColor: DS.lime },
  segmentTxt: { fontSize: 13, fontWeight: '700', color: DS.textMuted },
  segmentTxtActive: { color: DS.bg },

  // Menu
  sportSwitchWrap: { marginHorizontal: 16, marginBottom: 16 },
  menuCard: { backgroundColor: DS.surfaceHigh, borderRadius: 16 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  menuItemDivider: { backgroundColor: DS.surfaceHigh },
  menuLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: DS.surfaceLow,
    alignItems: 'center', justifyContent: 'center',
  },
  menuTitle: { fontSize: 14, fontWeight: '600', color: DS.textPrimary },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: DS.surfaceHigh, borderRadius: 16,
    paddingVertical: 14, marginBottom: 24,
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: DS.live },
});
