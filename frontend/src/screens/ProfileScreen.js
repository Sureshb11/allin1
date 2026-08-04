import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Share, ActivityIndicator, Image
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { pickAndUploadImage } from '../utils/imageUpload';
import { useNavigation } from '@react-navigation/native';
import AppHeader from '../components/AppHeader';
import { setCurrentAvatar, clearCurrentUser } from '../utils/currentUser';
import { clearPlayerSetup } from '../utils/playerSetup';
import legendsApi from '../services/LegendsApi';
import { unregisterFromPush } from '../services/push';
import SportSwitcher from '../components/SportSwitcher';

import { BRAND_NAME, BRAND_TAGLINE } from '../components/BrandLogo';
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';
import { getSelectedSport } from '../utils/selectedSport';
import { getSport } from '../sports';
import { canonicalRole } from '../utils/squadOrder';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

// The career numbers used to live here too — a bento grid, a BATTING/BOWLING
// table and a recent-form list, all built from the same GET /users/me/stats
// that the My Stats tab renders far better (CareerBoard: form chart, honours,
// per-panel breakdowns). Two screens, one endpoint, two different-looking
// answers to "how have I played" — and the profile's was the worse one.
//
// So this screen is now about WHO you are, and it finally shows what Edit
// Profile has been collecting all along: how you play, your team, where you
// are, your bio. Career lives one tap away, in the place built for it.

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
  // How this person plays lives on their PLAYER row, not their account — role,
  // batting hand, bowling style and the team they turn out for. The hero has
  // been printing `profile.role || 'Player'` and a `profile.teamName` pill since
  // it was written; User has neither column, so it read "Player" for everybody
  // and the team pill has never once rendered.
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // One labelled fact — "Bats · Right handed". Value greys out when nothing has
  // been said yet, which is a prompt rather than a blank.
  const Fact = ({ icon, label, value }) => (
    <View style={styles.factRow}>
      <Icon name={icon} size={17} color={DS.textMuted} style={{ width: 22 }} />
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, !value && styles.factValueEmpty]} numberOfLines={1}>
        {value || 'Not set'}
      </Text>
    </View>
  );

  const uploadRef = useRef(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    if (uploadRef.current) return;
    try {
      // Scoped to the sport being viewed: a user can hold a player row per
      // sport, and an unscoped lookup returned whichever came first — so a
      // footballer's profile could describe them as a right-arm quick.
      const profileRes = await legendsApi.getUserProfile(getSelectedSport().sport?.id);
      if (profileRes.success) {
        setProfile(profileRes.data);
        setPlayer(profileRes.player || null);
        setCurrentAvatar(profileRes.data?.avatarUrl || null);
      }
    } catch {
      Alert.alert('Error', 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  const shareProfile = async () => {
    const sp = getSelectedSport().sport || { name: 'Cricket' };
    const name = profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Player';
    // Who they are, not what they've scored. My Stats has its own Share Card
    // action that sends the career board as an image — a profile share that
    // repeated three of those numbers as text was the weaker of the two.
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
          await unregisterFromPush();                      // stop pushes to this device
          await legendsApi.logout();                       // clear persisted JWT
          clearCurrentUser();                              // wipe cached id/name/avatar
          clearPlayerSetup();                              // next account answers "do you play?" itself
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
  const sport = getSelectedSport().sport || { id: 'cricket', name: 'Cricket' };
  const sportAccent = getSport(sport.id)?.accent || DS.lime;

  // The role, spelled the app's way. Player.role is free text typed by whoever
  // added the player, so the same person reads "Bat" here and "Batter" in a
  // squad list unless it's folded (utils/squadOrder).
  const role = canonicalRole(player?.role, sport.id) || (player?.role !== 'Player' ? player?.role : null);
  const isCricket = sport.id === 'cricket';
  // Nothing said yet — either they've never played, or they tapped "I'm here to
  // watch" on the way in. Both get an invitation rather than a row of dashes.
  const hasPlayInfo = !!(role || player?.battingStyle || player?.bowlingStyle);
  const place = [profile.city, profile.district, profile.state, profile.country]
    .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');

  return (
    <View style={styles.container}>
      <AppHeader />
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
              // Last resort: the sport's own colour, not a stock CRICKET photo
              // (which is what this was — a hotlinked Unsplash cricket shot
              // shown on every sport's profile). Also removes a network
              // dependency from the profile header.
              <View style={[styles.coverPhoto, { backgroundColor: sportAccent }]} />
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
        </View>

        {/* User Info */}
        <View style={styles.heroInfo}>
          <Text style={styles.heroName}>{displayName}</Text>
          {/* Only when it's true. This line said "Player" for every account in
              the app, because it read a column User does not have. */}
          {!!role && <Text style={styles.heroRole}>{role}</Text>}
          {!!profile.phone && <Text style={styles.heroPhone}>{profile.phone}</Text>}
          <View style={styles.heroPills}>
            {isPremium && (
              <View style={styles.membershipPill}>
                <Icon name="star-circle" size={12} color={DS.lime} />
                <Text style={[styles.membershipText, { color: DS.lime }]}>Premium</Text>
              </View>
            )}
            {!!player?.team?.name && (
              <TouchableOpacity style={styles.teamPill} activeOpacity={0.75}
                onPress={() => navigation.navigate('TeamProfile', { teamId: player.team.id })}>
                <Icon name="shield" size={11} color={DS.lime} />
                <Text style={styles.teamPillText}>{player.team.name}</Text>
              </TouchableOpacity>
            )}
            {!!place && (
              <View style={styles.teamPill}>
                <Icon name="map-marker" size={11} color={DS.textMuted} />
                <Text style={styles.teamPillText} numberOfLines={1}>{place}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.body}>
        {/* ── How I play ──
            The three answers the app now asks for on the way in, and the only
            place they are ever shown. Everything under here is something Edit
            Profile has always collected and no screen ever displayed. */}
        <View style={styles.section}>
          <View style={styles.cardHead}>
            <Text style={styles.sectionTitle}>How I play</Text>
            <TouchableOpacity onPress={() => navigation.navigate('EditPlayerProfile')} hitSlop={10}>
              <Text style={styles.cardAction}>Edit</Text>
            </TouchableOpacity>
          </View>

          {hasPlayInfo ? (
            <>
              <Fact icon="account-star" label="Role" value={role} />
              {isCricket && <Fact icon="cricket" label="Bats" value={player?.battingStyle} />}
              {isCricket && (
                <Fact icon="bowling" label="Bowls"
                  value={player?.bowlingStyle === 'None' ? "Doesn't bowl" : player?.bowlingStyle} />
              )}
            </>
          ) : (
            // Said nothing yet — either they've never played, or they chose
            // "I'm here to watch". Neither deserves a row of dashes, and both
            // can change their mind from right here.
            <TouchableOpacity style={styles.invite} activeOpacity={0.85}
              onPress={() => navigation.navigate('EditPlayerProfile')}>
              <Icon name="account-plus-outline" size={19} color={DS.lime} />
              <View style={{ flex: 1 }}>
                <Text style={styles.inviteTitle}>Tell us how you play</Text>
                <Text style={styles.inviteBlurb}>
                  Your role and style show up in squad lists and on scorecards.
                </Text>
              </View>
              <Icon name="chevron-right" size={19} color={DS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── About ── bio, collected since the beginning and never once shown */}
        {!!profile.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bio}>{profile.bio}</Text>
          </View>
        )}

        {/* Career lives in the tab built for it — form chart, honours, the full
            batting and bowling boards. This screen used to render a thinner
            copy of the same payload. */}
        <TouchableOpacity style={styles.linkRow} activeOpacity={0.8}
          onPress={() => navigation.navigate('Pavilion', { tab: 'My Stats' })}>
          <View style={[styles.linkIcon, { backgroundColor: sportAccent + '1f' }]}>
            <Icon name="chart-line" size={19} color={sportAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle}>My stats</Text>
            <Text style={styles.linkBlurb}>Career, recent form and honours</Text>
          </View>
          <Icon name="chevron-right" size={20} color={DS.textMuted} />
        </TouchableOpacity>

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

  // Cards
  section: { backgroundColor: DS.surfaceHigh, borderRadius: radii?.md || 16, padding: 16, gap: 8, borderWidth: 1, borderColor: DS.border, ...(shadows?.sm || {}) },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: DS.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardAction: { fontSize: 12, fontWeight: '800', color: DS.lime, letterSpacing: 0.3 },

  // How I play
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: DS.faint },
  factLabel: { fontSize: 13, fontWeight: '600', color: DS.textVariant, width: 52 },
  factValue: { flex: 1, fontSize: 14, fontWeight: '700', color: DS.textPrimary, textAlign: 'right' },
  factValueEmpty: { color: DS.textMuted, fontWeight: '600' },

  invite: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingTop: 4 },
  inviteTitle: { fontSize: 14, fontWeight: '800', color: DS.textPrimary },
  inviteBlurb: { fontSize: 11.5, fontWeight: '600', color: DS.textMuted, marginTop: 2, lineHeight: 15 },

  bio: { fontSize: 13.5, fontWeight: '600', color: DS.textVariant, lineHeight: 20 },

  // Link out to the tab that owns career numbers
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    backgroundColor: DS.surfaceHigh, borderRadius: radii?.md || 16,
    borderWidth: 1, borderColor: DS.border, ...(shadows?.sm || {}),
  },
  linkIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: 14.5, fontWeight: '800', color: DS.textPrimary },
  linkBlurb: { fontSize: 11.5, fontWeight: '600', color: DS.textMuted, marginTop: 2 },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, marginTop: 4, marginBottom: 24,
  },
  logoutText: { fontSize: 13, fontWeight: '700', color: DS.textMuted },
});
