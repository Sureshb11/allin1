import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Share, ActivityIndicator, Image
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { pickAndUploadImage } from '../utils/imageUpload';
import { useNavigation } from '@react-navigation/native';
import { useCurrentUser } from '../utils/currentUser';
import AppHeader from '../components/AppHeader';
import { setCurrentAvatar, clearCurrentUser } from '../utils/currentUser';
import legendsApi from '../services/LegendsApi';
import SportSwitcher from '../components/SportSwitcher';

import { BRAND_NAME, BRAND_TAGLINE } from '../components/BrandLogo';
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';
import { getSelectedSport } from '../utils/selectedSport';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

// Sport-aware profile stats: which stored-stat fields to surface per sport (first 4
// present are shown). Anything not listed falls back to DEFAULT_FIELDS.
// Third element = accent: the career OUTPUT a player is judged on (runs, wickets,
// goals) reads lime; context (matches) and rates (strike rate) stay plain. This
// used to be positional (`i >= 2`), which accented whichever fields happened to
// land 3rd and 4th.
const SPORT_STAT_FIELDS = {
  cricket:  [['matches', 'Matches'], ['runs', 'Runs', true], ['wickets', 'Wickets', true], ['strikeRate', 'Strike Rate']],
  football: [['matches', 'Matches'], ['goals', 'Goals', true], ['assists', 'Assists', true], ['cleanSheets', 'Clean Sheets']],
};
const DEFAULT_STAT_FIELDS = [['matches', 'Matches'], ['events', 'Events'], ['fights', 'Fights'], ['wins', 'Wins', true], ['titles', 'Titles', true], ['ko', 'KO'], ['goals', 'Goals']];

// Career detail, grouped. The API already computes all of this from the
// ball-by-ball data (see backend getUserStats) — the profile just never asked
// for it, which is why the screen sat half empty. Only fields the API actually
// returns are rendered, so a player with no bowling gets no BOWLING block.
const SPORT_STAT_GROUPS = {
  cricket: [
    { title: 'BATTING', fields: [
      ['highestScore', 'Highest'], ['average', 'Average'], ['halfCenturies', '50s'],
      ['centuries', '100s'], ['fours', '4s'], ['sixes', '6s'],
      ['notOuts', 'Not Outs'], ['ballsFaced', 'Balls Faced'],
    ] },
    { title: 'BOWLING', fields: [
      ['bestBowling', 'Best'], ['economy', 'Economy'], ['bowlingAverage', 'Average'],
      ['fiveWickets', '5W Hauls'], ['oversBowled', 'Overs'], ['runsConceded', 'Runs Given'],
    ] },
  ],
};

// A stat is worth showing if the API returned a real value. Not a plain
// `typeof === 'number'` check: oversBowled ("3.2") and bestBowling ("3/12") are
// strings, and bowlingAverage is null until the player takes a wicket.
const hasStat = (v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(v);


export default function ProfileScreen({ navigation }) {
  const { colors: DS, pref, setMode, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();
  const toggleTheme = () => setMode(isDark ? 'light' : 'dark');

  // Hex action button (Share / Edit / Theme in the action bar) — the Arena
  // honeycomb motif, same as the avatar and the app's other hex tiles.
  const ActionIcon = ({ icon, label, color, onPress }) => (
    <TouchableOpacity style={styles.actionItem} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.actionIconWrap}>
        <Icon name={icon} size={24} color={color || DS.lime} />
      </View>
      <Text style={styles.actionLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
  const [profile, setProfile] = useState({});
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const BentoStat = ({ label, value, accent = false }) => (
    <View style={[styles.bentoCard, accent && styles.bentoCardAccent]}>
      <Text style={[styles.bentoValue, accent && styles.bentoValueAccent]}>{value ?? '—'}</Text>
      <Text style={[styles.bentoLabel, accent && styles.bentoLabelAccent]}>{label}</Text>
    </View>
  );

  const uploadRef = useRef(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    if (uploadRef.current) return;
    try {
      const [profileRes, statsRes] = await Promise.all([
        legendsApi.getUserProfile(),
        legendsApi.getUserStats(),
      ]);
      if (profileRes.success) { setProfile(profileRes.data); setCurrentAvatar(profileRes.data?.avatarUrl || null); }
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
        message: `🏆 ${name} on ${BRAND_NAME} · ${sp.name}\n` +
          (line ? `📊 ${line}\n` : '') +
          `${BRAND_NAME} — ${BRAND_TAGLINE}`,
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
          clearCurrentUser();                              // wipe cached id/name/avatar
          // Reset the ROOT navigator back to the auth flow.
          const root = navigation.getParent('RootStack') || navigation;
          root.reset({ index: 0, routes: [{ name: 'Auth' }] });
        },
      },
    ]);
  };

  const handleAvatarPress = async () => {
    try {
      uploadRef.current = true;
      const result = await pickAndUploadImage();
      if (result && result.url) {
        setProfile(prev => ({ ...prev, avatarUrl: result.url }));
        setCurrentAvatar(result.url);
        const upRes = await legendsApi.updateUserProfile({ avatarUrl: result.url });
        if (upRes.success && upRes.data) {
          setProfile(upRes.data);
        }
      }
    } catch (e) {
      console.log('Upload error', e);
    } finally {
      uploadRef.current = false;
      loadProfile();
    }
  };

  const handleCoverPress = async () => {
    try {
      uploadRef.current = true;
      const result = await pickAndUploadImage('avatars'); // use avatars folder for compression
      if (result && result.url) {
        setProfile(prev => ({ ...prev, coverUrl: result.url }));
        const upRes = await legendsApi.updateUserProfile({ coverUrl: result.url });
        if (upRes.success && upRes.data) {
          setProfile(upRes.data);
        }
      }
    } catch (e) {
      console.log('Upload error', e);
    } finally {
      uploadRef.current = false;
      loadProfile();
    }
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
    .map(([k, label, accent]) => ({ label, value: stats[k], accent: !!accent }));

  // Career detail blocks — only groups with at least one real value render.
  const statGroups = (SPORT_STAT_GROUPS[sport.id] || [])
    .map((g) => ({
      title: g.title,
      items: g.fields.filter(([k]) => hasStat(stats[k])).map(([k, label]) => ({ label, value: stats[k] })),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <View style={styles.container}>
      <AppHeader hideProfileIcon />
      <ScrollView showsVerticalScrollIndicator={false}
        {...hideTabBar} contentContainerStyle={{ paddingBottom: tabClear }}>
      {/* Hero Header */}
      <View style={styles.hero}>
        {/* Background Cover */}
        <View style={styles.coverWrap}>
          <TouchableOpacity activeOpacity={0.9} onPress={handleCoverPress} style={{ width: '100%', height: '100%' }}>
            {profile.coverUrl ? (
              <Image source={{ uri: profile.coverUrl }} style={styles.coverPhoto} resizeMode="cover" />
            ) : profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.coverPhoto} resizeMode="cover" blurRadius={15} />
            ) : (
              <Image source={{ uri: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=3538&auto=format&fit=crop' }} style={styles.coverPhoto} resizeMode="cover" />
            )}
            <View style={styles.coverDarkenOverlay} />
            <View style={styles.coverUploadOverlay}>
              <Icon name="camera" size={20} color="#FFF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Overlapping Profile Picture */}
        <View style={styles.avatarContainer}>
          <TouchableOpacity activeOpacity={0.9} onPress={handleAvatarPress}>
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.largeAvatar} resizeMode="cover" />
            ) : (
              <View style={[styles.largeAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            
            <View style={styles.uploadOverlay}>
              <Icon name="camera" size={16} color={DS.textPrimary} />
            </View>
          </TouchableOpacity>

          {stats.momCount > 0 && (
            <View style={styles.momBadgeOverlap}>
              <Icon name="star" size={12} color={DS.bg} />
              <Text style={styles.momBadgeTextOverlap}>{stats.momCount} MOM</Text>
            </View>
          )}
        </View>

        {/* User Info */}
        <View style={styles.heroInfo}>
          <Text style={styles.heroName}>{displayName}</Text>
          <Text style={styles.heroRole}>{profile.role || 'Player'}</Text>
          {!!profile.phone && <Text style={styles.heroPhone}>{profile.phone}</Text>}
          <View style={styles.heroPills}>
            {isPremium && (
              <View style={styles.membershipPill}>
                <Icon name="star-circle" size={12} color={DS.lime} />
                <Text style={[styles.membershipText, { color: DS.lime }]}>Premium</Text>
              </View>
            )}
            {profile.teamName && (
              <View style={styles.teamPill}>
                <Icon name="shield" size={11} color={DS.lime} />
                <Text style={styles.teamPillText}>{profile.teamName}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Bento Stats Grid — sport-aware */}
        {statCards.length > 0 && (
          <View style={[styles.bentoGrid, { paddingHorizontal: 16, marginTop: 24 }]}>
            {statCards.map((c) => (
              <BentoStat key={c.label} label={c.label} value={c.value} accent={c.accent} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.body}>
        {/* Career detail — the numbers the API already computes per delivery */}
        {statGroups.map((g) => (
          <View key={g.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{g.title}</Text>
            <View style={styles.statWrap}>
              {g.items.map((it) => (
                <View key={it.label} style={styles.statCell}>
                  <Text style={styles.statCellValue}>{it.value}</Text>
                  <Text style={styles.statCellLabel} numberOfLines={1}>{it.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Recent Form */}
        {recentForm.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>RECENT FORM</Text>
            {recentForm.map((match, i) => (
              <View key={i} style={styles.formRow}>
                {/* result is null for a tie (or an unparseable result string) —
                    that's neither a win nor a loss, so it reads neutral. */}
                <View style={[styles.resultDot, {
                  backgroundColor: match.result === 'W' ? DS.lime
                    : match.result === 'L' ? DS.live : DS.textMuted,
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
                  color: match.result === 'W' ? DS.lime
                    : match.result === 'L' ? DS.live : DS.textMuted,
                }]}>{match.result === 'W' ? 'Won' : match.result === 'L' ? 'Lost' : 'Tied'}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Icon action bar — Share · Edit · Sport · Theme */}
        <View style={styles.actionBar}>
          <ActionIcon icon="whatsapp" label="Share" color="#25D366" onPress={shareProfile} />
          <ActionIcon icon="account-edit" label="Edit" onPress={() => navigation.navigate('EditPlayerProfile')} />
          <SportSwitcher navigation={navigation} variant="iconButton" />
          <ActionIcon
            icon={isDark ? 'white-balance-sunny' : 'weather-night'}
            label={isDark ? 'Light' : 'Dark'}
            color={DS.blue}
            onPress={toggleTheme}
          />
        </View>



        {/* Logout — a quiet text link. It used to be the boldest card on a
            screen about your career; a destructive action shouldn't anchor it. */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Icon name="logout" size={15} color={DS.textMuted} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (DS, typo, radii, shadows) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },

  // Hero
  hero: { backgroundColor: DS.bg, paddingBottom: 24 },
  coverWrap: { width: '100%', height: 160, position: 'relative' },
  coverPhoto: { width: '100%', height: '100%' },
  coverDarkenOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  coverUploadOverlay: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.5)', width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  
  avatarContainer: { alignItems: 'center', marginTop: -60, marginBottom: 12 },
  largeAvatar: {
    width: 120, height: 120, borderRadius: 60,
    borderWidth: 4, borderColor: DS.bg,
    backgroundColor: DS.surfaceHighest,
  },
  uploadOverlay: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: DS.surfaceHigh, width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: DS.bg,
  },
  momBadgeOverlap: {
    position: 'absolute', bottom: -12,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: DS.lime,
    borderWidth: 3, borderColor: DS.bg,
    justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  momBadgeTextOverlap: { fontSize: 12, fontWeight: '900', color: DS.bg },
  
  avatarText: { fontSize: 40, fontWeight: '900', color: DS.lime },
  
  heroInfo: { alignItems: 'center', gap: 2, paddingHorizontal: 16 },
  heroName: { fontSize: 26, fontWeight: '800', color: DS.textPrimary, textAlign: 'center' },
  heroRole: { fontSize: 14, color: DS.textVariant, marginTop: 4, fontWeight: '600', textAlign: 'center' },
  heroPhone: { fontSize: 12, color: DS.textMuted, marginTop: 2, textAlign: 'center' },
  heroPills: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  membershipPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: DS.surfaceHigh, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  membershipText: { fontSize: 12, color: DS.textMuted, fontWeight: '700' },
  teamPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: DS.surfaceHigh, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 12,
  },
  teamPillText: { fontSize: 12, color: DS.textVariant, fontWeight: '600' },

  // Bento grid
  bentoGrid: { flexDirection: 'row', gap: 8 },
  bentoCard: {
    flex: 1, backgroundColor: DS.surfaceHigh,
    borderRadius: radii?.md || 16, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: DS.border,
    ...(shadows?.sm || {}),
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

  // Icon action bar (Share · Edit · Sport · Theme)
  actionBar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start',
    backgroundColor: DS.surfaceHigh, borderRadius: radii?.lg || 24, paddingVertical: 16, paddingHorizontal: 8,
    borderWidth: 1, borderColor: DS.border,
    ...(shadows?.sm || {}),
  },
  actionItem: { alignItems: 'center', gap: 6, width: 64 },
  actionIconWrap: {
    width: 52, height: 52, borderRadius: radii?.pill || 999,
    backgroundColor: DS.surfaceLow,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: DS.border,
  },
  actionLabel: { fontSize: 11, fontWeight: '700', color: DS.textVariant },

  // Career detail grid — 4-up, wrapping, so a block sizes to whatever the API
  // returned rather than assuming a fixed field count.
  statWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '25%', alignItems: 'center', paddingVertical: 8 },
  statCellValue: { fontSize: 17, fontWeight: '800', color: DS.textPrimary },
  statCellLabel: { fontSize: 10, color: DS.textMuted, marginTop: 2, textAlign: 'center' },

  // Recent form
  section: { backgroundColor: DS.surfaceHigh, borderRadius: radii?.md || 16, padding: 16, gap: 8, borderWidth: 1, borderColor: DS.border, ...(shadows?.sm || {}) },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  galleryImg: { width: 88, height: 88, borderRadius: 10, backgroundColor: DS.surfaceLow },
  galleryAdd: { width: 88, height: 88, borderRadius: 10, borderWidth: 1.5, borderColor: DS.lime, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 },
  galleryAddTxt: { color: DS.lime, fontSize: 11, fontWeight: '700' },
  galleryHint: { fontSize: 11, color: DS.textMuted, marginTop: 4 },
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
  shareBtnText: { fontSize: 15, fontWeight: '700', color: DS.white },

  // Quick actions
  quickRow: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: DS.surfaceHigh, borderRadius: 16,
    paddingVertical: 12,
  },
  quickBtnText: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },

  // Appearance
  appearanceCard: { backgroundColor: DS.surfaceHigh, borderRadius: radii?.md || 16, padding: 16, gap: 12, borderWidth: 1, borderColor: DS.border, ...(shadows?.sm || {}) },
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
  menuCard: { backgroundColor: DS.surfaceHigh, borderRadius: radii?.md || 16, borderWidth: 1, borderColor: DS.border, overflow: 'hidden', ...(shadows?.sm || {}) },
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, marginTop: 4, marginBottom: 24,
  },
  logoutText: { fontSize: 13, fontWeight: '700', color: DS.textMuted },
});
