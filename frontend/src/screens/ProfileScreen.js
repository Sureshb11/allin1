import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Share, ActivityIndicator, Image, RefreshControl, Animated, Easing, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { pickAndUploadImage } from '../utils/imageUpload';
import { useFocusEffect } from '@react-navigation/native';
import AppHeader from '../components/AppHeader';
import { setCurrentAvatar, clearCurrentUser } from '../utils/currentUser';
import { clearPlayerSetup } from '../utils/playerSetup';
import legendsApi from '../services/LegendsApi';
import { unregisterFromPush } from '../services/push';
import SportSwitcher from '../components/SportSwitcher';

import { BRAND_NAME, BRAND_TAGLINE } from '../components/BrandLogo';
import { useHideTabBarOnScroll, useTabBarClearance, useDockTranslate } from '../components/AutoHideTabBar';
import { getSelectedSport } from '../utils/selectedSport';
import { getSport } from '../sports';
import { canonicalRole } from '../utils/squadOrder';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

function ProfileSkeleton({ DS }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.75, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const Bar = (p) => (
    <Animated.View style={{ backgroundColor: DS.surfaceHigh, opacity: pulse, borderRadius: p.r ?? 6, ...p }} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: DS.bg }}>
      <Bar width="100%" height={220} r={0} />
      <View style={{ alignItems: 'center', marginTop: -60 }}>
        <Bar width={120} height={120} r={60} />
        <View style={{ height: 16 }} />
        <Bar width={180} height={24} />
        <View style={{ height: 10 }} />
        <Bar width={100} height={14} />
      </View>
      <View style={{ padding: 20, gap: 16, marginTop: 24 }}>
        <Bar width="100%" height={160} r={20} />
        <Bar width="100%" height={80} r={20} />
      </View>
    </View>
  );
}

export default function ProfileScreen({ navigation }) {
  const { colors: DS, setMode, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();
  const dockY = useDockTranslate();
  const toggleTheme = () => setMode(isDark ? 'light' : 'dark');

  // `label` is not optional in spirit: every control in this dock is icon-only,
  // so without it a screen reader announces four identical unnamed buttons.
  const ActionIcon = ({ icon, color, onPress, label }) => (
    <TouchableOpacity style={styles.actionItem} activeOpacity={0.7} onPress={onPress}
      accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.actionIconWrap}>
        <Icon name={icon} size={24} color={color || DS.textPrimary} />
      </View>
    </TouchableOpacity>
  );

  const [profile, setProfile] = useState({});
  const [player, setPlayer] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [statsStatus, setStatsStatus] = useState(null);


  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const uploadRef = useRef(false);

  const loadProfile = useCallback(async () => {
    if (uploadRef.current) return;
    try {
      const profileRes = await legendsApi.getUserProfile(getSelectedSport().sport?.id);
      if (profileRes.success) {
        setProfile(profileRes.data);
        setPlayer(profileRes.player || null);
        setTeams(profileRes.teams || []);
        setCurrentAvatar(profileRes.data?.avatarUrl || null);

        if (profileRes.player?.id) {
          const statusRes = await legendsApi.getHistoricalStatsStatus(profileRes.player.id);
          if (statusRes.success) {
            setStatsStatus(statusRes.submission);
          }
        }
      }
      

    } catch {
      Alert.alert('Error', 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadProfile(); }, [loadProfile]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProfile().finally(() => setRefreshing(false));
  }, [loadProfile]);

  const shareProfile = async () => {
    const sp = getSelectedSport().sport || { name: 'Cricket' };
    const name = profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Player';
    const bits = [
      canonicalRole(player?.role, sp.id) || player?.role,
      player?.team?.name && `plays for ${player.team.name}`,
    ].filter(Boolean).join(' · ');
    try {
      await Share.share({
        message: `🏆 ${name} on ${BRAND_NAME} · ${sp.name}\n` +
          (bits ? `${bits}\n` : '') +
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
          await unregisterFromPush();
          await legendsApi.logout();
          clearCurrentUser();
          clearPlayerSetup();
          const root = navigation.getParent('RootStack') || navigation;
          root.reset({ index: 0, routes: [{ name: 'Auth' }] });
        },
      },
    ]);
  };

  const uploadPhoto = async (which) => {
    const field = which === 'avatar' ? 'avatarUrl' : 'coverUrl';
    try {
      uploadRef.current = true;
      const result = await pickAndUploadImage('avatars');
      if (result?.url) {
        setUploading(which);
        setProfile((prev) => ({ ...prev, [field]: result.url }));
        if (which === 'avatar') setCurrentAvatar(result.url);
        const upRes = await legendsApi.updateUserProfile({ [field]: result.url });
        if (upRes.success && upRes.data) setProfile(upRes.data);
        else if (!upRes.success) Alert.alert('Could not save photo', upRes.error || 'Please try again');
      }
    } catch (e) {
      console.log('Upload error', e);
    } finally {
      uploadRef.current = false;
      setUploading(null);
      loadProfile();
    }
  };

  if (loading) return <ProfileSkeleton DS={DS} />;

  const displayName = profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Your Name';
  const initials = (displayName === 'Your Name' ? 'U' : displayName)
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const isPremium = profile.plan === 'pro';
  const sport = getSelectedSport().sport || { id: 'cricket', name: 'Cricket' };
  const role = canonicalRole(player?.role, sport.id) || (player?.role !== 'Player' ? player?.role : null);
  const isCricket = sport.id === 'cricket';
  const hasPlayInfo = !!(role || player?.battingStyle || player?.bowlingStyle);
  const place = [profile.city, profile.district, profile.state, profile.country]
    .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  const memberSince = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;

  return (
    <View style={styles.container}>
      <AppHeader />
      <ScrollView showsVerticalScrollIndicator={false}
        {...hideTabBar} contentContainerStyle={{ paddingBottom: tabClear }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={DS.lime} colors={[DS.lime]} />
        }>
        
        {/* ── Premium Player Card Hero ── */}
        <View style={styles.hero}>
          <TouchableOpacity activeOpacity={0.9} onPress={() => uploadPhoto('cover')} disabled={!!uploading} style={styles.coverWrap}>
            {profile.coverUrl ? (
              <Image source={{ uri: profile.coverUrl }} style={styles.coverPhoto} resizeMode="cover" />
            ) : profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.coverPhoto} resizeMode="cover" blurRadius={20} />
            ) : (
              <View style={[styles.coverPhoto, { backgroundColor: DS.lime }]} />
            )}
            
            {/* Smooth Gradient Fade to Background */}
            <View style={StyleSheet.absoluteFillObject}>
              <Svg width="100%" height="100%">
                <Defs>
                  <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={DS.bg} stopOpacity="0" />
                    <Stop offset="0.6" stopColor={DS.bg} stopOpacity="0.4" />
                    <Stop offset="1" stopColor={DS.bg} stopOpacity="1" />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#fade)" />
              </Svg>
            </View>

            <View style={styles.coverUploadOverlay}>
              {uploading === 'cover' ? <ActivityIndicator size="small" color="#FFF" /> : <Icon name="camera" size={18} color="#FFF" />}
            </View>
          </TouchableOpacity>

          {/* Floating Glass Avatar */}
          <View style={styles.avatarWrap}>
            <TouchableOpacity activeOpacity={0.9} onPress={() => uploadPhoto('avatar')} disabled={!!uploading} style={styles.largeAvatar}>
              {profile.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
              ) : (
                <View style={[styles.avatarImage, { backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={[styles.avatarText, { color: DS.lime }]}>{initials}</Text>
                </View>
              )}
              <View style={styles.uploadOverlay}>
                {uploading === 'avatar' ? <ActivityIndicator size="small" color={DS.textPrimary} /> : <Icon name="camera" size={16} color={DS.textPrimary} />}
              </View>
            </TouchableOpacity>
          </View>

          {/* Player Identity */}
          <View style={styles.heroInfo}>
            <Text style={styles.heroName}>{displayName}</Text>
            {!!role && <Text style={[styles.heroRole, { color: DS.lime }]}>{role.toUpperCase()}</Text>}
            {!!profile.phone && <Text style={styles.heroPhone}>{profile.phone}</Text>}
            
            {/* Sleek Pills */}
            <View style={styles.heroPills}>
              {isPremium && (
                <View style={[styles.pill, { borderColor: DS.lime, backgroundColor: DS.lime + '1A' }]}>
                  <Icon name="star-circle" size={12} color={DS.lime} />
                  <Text style={[styles.pillText, { color: DS.lime }]}>Premium</Text>
                </View>
              )}
              {!!place && (
                <View style={styles.pill}>
                  <Icon name="map-marker" size={12} color={DS.textVariant} />
                  <Text style={styles.pillText} numberOfLines={1}>{place}</Text>
                </View>
              )}
              {!!memberSince && (
                <View style={styles.pill}>
                  <Icon name="calendar-blank" size={12} color={DS.textVariant} />
                  <Text style={styles.pillText}>Since {memberSince}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.body}>
          
          {/* ── Bento Box: How I Play ── */}
          <View style={styles.bentoSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Sports Identity</Text>
              <TouchableOpacity onPress={() => navigation.navigate('EditPlayerProfile')} hitSlop={10}>
                <Text style={[styles.sectionAction, { color: DS.lime }]}>Edit</Text>
              </TouchableOpacity>
            </View>
            
            {hasPlayInfo ? (
              <View style={styles.bentoGrid}>
                {/* Full Width Role Card */}
                <View style={[styles.bentoCard, styles.bentoFullWidth]}>
                  <View style={[styles.bentoIconBadge, { backgroundColor: DS.lime + '22' }]}>
                    <Icon name="account-star" size={20} color={DS.lime} />
                  </View>
                  <View>
                    <Text style={styles.bentoLabel}>Role</Text>
                    <Text style={styles.bentoValue}>{role || 'Not set'}</Text>
                  </View>
                </View>
                
                {/* Half Width Cards */}
                {isCricket && (
                  <View style={styles.bentoRow}>
                    <View style={styles.bentoCardHalf}>
                      <View style={[styles.bentoIconBadge, { backgroundColor: DS.surfaceHighest }]}>
                        <Icon name="cricket" size={20} color={DS.textPrimary} />
                      </View>
                      <View style={{ marginTop: 16 }}>
                        <Text style={styles.bentoLabel}>Bats</Text>
                        <Text style={styles.bentoValue} numberOfLines={1}>{player?.battingStyle || 'Not set'}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.bentoCardHalf}>
                      <View style={[styles.bentoIconBadge, { backgroundColor: DS.surfaceHighest }]}>
                        <Icon name="bowling" size={20} color={DS.textPrimary} />
                      </View>
                      <View style={{ marginTop: 16 }}>
                        <Text style={styles.bentoLabel}>Bowls</Text>
                        <Text style={styles.bentoValue} numberOfLines={1}>{player?.bowlingStyle === 'None' ? "Doesn't bowl" : (player?.bowlingStyle || 'Not set')}</Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <TouchableOpacity style={[styles.bentoCard, styles.inviteCard, { borderColor: DS.lime }]} activeOpacity={0.85} onPress={() => navigation.navigate('EditPlayerProfile')}>
                <View style={[styles.bentoIconBadge, { backgroundColor: DS.lime + '22' }]}>
                  <Icon name="account-plus" size={22} color={DS.lime} />
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={styles.inviteTitle}>Tell us how you play</Text>
                  <Text style={styles.inviteBlurb}>Your role and style show up in squad lists and scorecards.</Text>
                </View>
                <Icon name="chevron-right" size={22} color={DS.lime} />
              </TouchableOpacity>
            )}
          </View>

          {/* ── Teams Banner ── */}
          {teams.length > 0 && (
            <View style={styles.bentoSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{teams.length === 1 ? 'My Team' : `My Teams (${teams.length})`}</Text>
              </View>
              {teams.map((t) => (
                <TouchableOpacity key={t.id} style={styles.teamBanner} activeOpacity={0.85} onPress={() => navigation.navigate('TeamProfile', { teamId: t.id })}>
                  {t.logoUrl ? (
                    <Image source={{ uri: t.logoUrl }} style={styles.teamLogoLarge} resizeMode="cover" />
                  ) : (
                    <View style={[styles.teamLogoLarge, styles.teamLogoFallback]}>
                      <Text style={[styles.teamLogoText, { color: DS.lime }]}>{(t.name || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, paddingRight: 16 }}>
                    <Text style={styles.teamBannerName} numberOfLines={1}>{t.name}</Text>
                    {!!(t.city || t.homeGround) && <Text style={styles.teamBannerMeta} numberOfLines={1}>{t.city || t.homeGround}</Text>}
                  </View>
                  <Icon name="chevron-right" size={24} color={DS.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── About ── */}
          {!!profile.bio && (
            <View style={styles.bentoSection}>
              <Text style={styles.sectionTitle}>About</Text>
              <View style={styles.bioCard}>
                <Text style={styles.bioText}>{profile.bio}</Text>
              </View>
            </View>
          )}

          {/* ── Tactile Stats Cards ── */}
          <View style={styles.bentoSection}>
            <Text style={styles.sectionTitle}>Performance</Text>
            
            {(!statsStatus || statsStatus.status !== 'approved') && (
              <TouchableOpacity 
                style={[
                  styles.statsCard, 
                  statsStatus?.status === 'rejected' && { borderColor: '#ef4444', borderWidth: 1 }
                ]} 
                activeOpacity={statsStatus?.status === 'pending' ? 1 : 0.8} 
                onPress={() => {
                  if (statsStatus?.status !== 'pending') {
                    navigation.navigate('HistoricalStatsSource', { sport });
                  }
                }}
              >
                <View style={[
                  styles.statsCardIcon, 
                  { backgroundColor: statsStatus?.status === 'pending' ? DS.textMuted : (statsStatus?.status === 'rejected' ? '#ef4444' : DS.lime) }
                ]}>
                  <Icon 
                    name={statsStatus?.status === 'pending' ? "clock-outline" : (statsStatus?.status === 'rejected' ? "alert-circle" : "cloud-upload")} 
                    size={22} 
                    color="#fff" 
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[
                    styles.statsCardTitle,
                    statsStatus?.status === 'rejected' && { color: '#ef4444' }
                  ]}>
                    {statsStatus?.status === 'pending' ? 'Pending Verification' : (statsStatus?.status === 'rejected' ? 'Upload Rejected' : 'Upload Past Stats')}
                  </Text>
                  <Text style={styles.statsCardBlurb}>
                    {statsStatus?.status === 'pending' 
                      ? 'Admin is reviewing your scorecard' 
                      : (statsStatus?.status === 'rejected' 
                          ? (statsStatus.adminNote || 'Please try uploading again') 
                          : 'Bring in your old scorecards')}
                  </Text>
                </View>
                {statsStatus?.status !== 'pending' && <Icon name="chevron-right" size={22} color={DS.textMuted} />}
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.statsCard} activeOpacity={0.8} onPress={() => navigation.navigate('Pavilion', { tab: 'My Stats' })}>
              <View style={[styles.statsCardIcon, { backgroundColor: DS.lime + '1a' }]}>
                <Icon name="chart-box" size={22} color={DS.lime} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statsCardTitle}>My Stats & Career</Text>
                <Text style={styles.statsCardBlurb}>Career totals, recent form and honours</Text>
              </View>
              <Icon name="chevron-right" size={22} color={DS.textMuted} />
            </TouchableOpacity>
          </View>

        </View>
      </ScrollView>

      {/* ── Floating Action Dock ── */}
      <Animated.View
        pointerEvents="box-none"
        style={[styles.floatingDockWrap, { bottom: tabClear + 12 },
                dockY ? { transform: [{ translateY: dockY }] } : null]}>
        <View style={styles.floatingDock}>
          <ActionIcon icon="share-variant" onPress={shareProfile} color={isDark ? DS.textPrimary : DS.textSecondary} label="Share profile" />
          <View style={styles.dockDivider} />
          <ActionIcon icon="account-edit" onPress={() => navigation.navigate('EditPlayerProfile')} color={isDark ? DS.textPrimary : DS.textSecondary} label="Edit profile" />
          <View style={styles.dockDivider} />
          <SportSwitcher navigation={navigation} variant="iconButton" />
          <View style={styles.dockDivider} />
          <ActionIcon
            icon={isDark ? 'white-balance-sunny' : 'weather-night'}
            color={isDark ? '#FDB813' : DS.blue}
            onPress={toggleTheme}
            label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          />
          <View style={styles.dockDivider} />
          {/* Logout, beside the theme toggle rather than a full-width row at the
              bottom of the scroll. Coral because it is the only action in this
              dock you would regret hitting — the others share, edit, switch
              sport and change theme, all of which undo themselves. It is still
              confirm-gated; the colour is so the finger slows down first. */}
          <ActionIcon
            icon="logout"
            color={DS.coral}
            onPress={handleLogout}
            label="Log out of Local Legends"
          />
        </View>
      </Animated.View>
    </View>
  );
}

// What the floating dock actually occupies: its own padding (8 top + 8 bottom)
// around a 48dp control (24dp icon + 12dp padding each side), plus the 12dp it
// is lifted above the tab bar. Content has to end above THAT, not above a
// number somebody guessed once — the old paddingBottom was a bare 100 with
// nothing tying it to the thing it was clearing, so any change to the dock
// silently either overlapped it or left a gap.
const DOCK_H = 8 + 48 + 8;
const DOCK_CLEARANCE = DOCK_H + 12 + 16;   // dock + lift + breathing room

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  // Hero / Player Card
  hero: { backgroundColor: DS.bg, paddingBottom: 14 },
  coverWrap: { width: '100%', height: 200, position: 'relative' },
  coverPhoto: { width: '100%', height: '100%' },
  coverUploadOverlay: {
    position: 'absolute', top: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)', width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  
  avatarWrap: { alignItems: 'center', marginTop: -60, zIndex: 10 },
  largeAvatar: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: DS.surfaceHighest,
    padding: 6,
    borderWidth: DS.mode === 'dark' ? 2.5 : 0,
    borderColor: DS.mode === 'dark' ? DS.lime + '44' : 'transparent',
    shadowColor: DS.mode === 'dark' ? DS.lime : '#000',
    shadowOffset: { width: 0, height: DS.mode === 'dark' ? 0 : 8 },
    shadowOpacity: DS.mode === 'dark' ? 0.3 : 0.15,
    shadowRadius: DS.mode === 'dark' ? 16 : 12,
    elevation: 10,
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 60, backgroundColor: DS.surfaceHigh },
  avatarText: { fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  uploadOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: DS.surfaceHigh, width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: DS.bg,
  },
  
  heroInfo: { alignItems: 'center', marginTop: 10, paddingHorizontal: 20 },
  heroName: { fontSize: 32, fontWeight: '900', color: DS.textPrimary, letterSpacing: -1, textAlign: 'center' },
  heroRole: { fontSize: 13, fontWeight: '800', letterSpacing: 1.5, marginTop: 4, textAlign: 'center' },
  heroPhone: { fontSize: 13, color: DS.textMuted, marginTop: 4, fontWeight: '500', textAlign: 'center' },
  
  heroPills: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: DS.surfaceHigh, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: DS.surfaceHighest,
  },
  pillText: { fontSize: 12, color: DS.textVariant, fontWeight: '700' },

  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: DOCK_CLEARANCE },

  // Bento Sections
  bentoSection: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: DS.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  sectionAction: { fontSize: 13, fontWeight: '800' },
  
  bentoGrid: { gap: 12 },
  bentoRow: { flexDirection: 'row', gap: 12 },
  bentoCard: {
    backgroundColor: DS.surfaceHigh, borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: DS.surfaceHighest,
  },
  bentoFullWidth: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bentoCardHalf: {
    flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: DS.surfaceHighest,
  },
  bentoIconBadge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bentoLabel: { fontSize: 12, fontWeight: '600', color: DS.textMuted, marginBottom: 4 },
  bentoValue: { fontSize: 16, fontWeight: '800', color: DS.textPrimary },

  inviteCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5 },
  inviteTitle: { fontSize: 16, fontWeight: '800', color: DS.textPrimary, marginBottom: 4 },
  inviteBlurb: { fontSize: 13, fontWeight: '500', color: DS.textMuted, lineHeight: 18 },

  // Teams Banner
  teamBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16,
    backgroundColor: DS.surfaceHigh, borderRadius: 20,
    borderWidth: 1, borderColor: DS.surfaceHighest,
    marginBottom: 10,
  },
  teamLogoLarge: { width: 56, height: 56, borderRadius: 16, backgroundColor: DS.surfaceLow },
  teamLogoFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: DS.border },
  teamLogoText: { fontSize: 24, fontWeight: '900' },
  teamBannerName: { fontSize: 18, fontWeight: '800', color: DS.textPrimary, marginBottom: 4 },
  teamBannerMeta: { fontSize: 13, fontWeight: '600', color: DS.textMuted },

  // Bio
  bioCard: { backgroundColor: DS.surfaceHigh, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: DS.surfaceHighest },
  bioText: { fontSize: 15, fontWeight: '500', color: DS.textPrimary, lineHeight: 24 },

  // Tactile Stats Cards
  statsCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16,
    backgroundColor: DS.surface, borderRadius: 20,
    borderWidth: 1, borderColor: DS.border,
    marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: DS.mode === 'dark' ? 0.2 : 0.05, shadowRadius: 8, elevation: 3,
  },
  statsCardIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statsCardTitle: { fontSize: 16, fontWeight: '800', color: DS.textPrimary, marginBottom: 2 },
  statsCardBlurb: { fontSize: 13, fontWeight: '500', color: DS.textMuted },


  // Floating Action Dock
  // No `bottom` here on purpose — it is applied inline from useTabBarClearance().
  // A hardcoded 24/32 sat this dock directly ON TOP of the app's tab bar, which
  // is the overlap. The bar's height is not a constant: it changes with the
  // device's home indicator and safe-area inset, so the only correct value is
  // the one the navigator reports at runtime.
  floatingDockWrap: {
    position: 'absolute', left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  floatingDock: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: DS.mode === 'dark' ? DS.surfaceHigh : 'rgba(255, 255, 255, 0.95)',
    borderRadius: 36, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: DS.mode === 'dark' ? 'rgba(255,255,255,0.10)' : DS.border,
    shadowColor: DS.mode === 'dark' ? DS.lime : '#000',
    shadowOffset: { width: 0, height: DS.mode === 'dark' ? 0 : 8 },
    shadowOpacity: DS.mode === 'dark' ? 0.2 : 0.15,
    shadowRadius: DS.mode === 'dark' ? 16 : 16,
    elevation: 12,
  },
  actionItem: { padding: 12, alignItems: 'center', justifyContent: 'center' },
  actionIconWrap: { alignItems: 'center', justifyContent: 'center' },
  // marginHorizontal 3, not 4. The dock went from four controls to five when
  // logout moved in, and at 4 it measured 302dp against the 304dp a 320dp phone
  // can give it — fits, but by two points, which is not a margin so much as a
  // coincidence. Three buys ten. The 48dp touch targets are untouched; the
  // spacing between them absorbs the cost, which is the right thing to trade.
  dockDivider: { width: 1, height: 24, backgroundColor: DS.border, marginHorizontal: 3 },
});
