// ─────────────────────────────────────────────────────────────────────────────
// TeamProfileScreen — the full team hub.
//
// Anyone can view a team's profile; the team ADMIN (owner) additionally gets
// inline edit controls to manage everything from one place:
//   · logo + cover photo   (picked from the library → Vercel Blob → team record)
//   · squad members         (add by name / remove)
//   · matches               (recent fixtures & results)
//   · standings/leaderboard (same-sport table, this team highlighted)
//   · stats                 (played / won / win% / rank / runs / wickets)
//   · achievements & awards (free-text honours + a structured awards list)
//   · gallery               (team photos → Vercel Blob)
//
// One request (`getTeamProfile`) fills the whole screen; after any edit we reload
// it so every section stays in sync.
// ─────────────────────────────────────────────────────────────────────────────
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, TextInput, TouchableOpacity,
  ActivityIndicator, Modal, Dimensions, Alert, Switch, Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { getFind } from '../sports/find';
import legendsApi from '../services/LegendsApi';
import TeamStats from '../components/TeamStats';
import { makeControls } from '../theme/controls';
import { GestureDetector } from 'react-native-gesture-handler';
import { useFilterSwipe } from '../utils/useFilterSwipe';
import { pickAndUploadImage } from '../utils/imageUpload';
import { showToast } from '../components/Toast';
import { useCurrentUser } from '../utils/currentUser';
import { sportMeta } from '../sports';
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';

const { width: SCREEN_W } = Dimensions.get('window');
const GALLERY_COLS = 3;
const GALLERY_GAP = 6;

const initials = (name) =>
  (name || '').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function TeamProfileSkeleton({ DS }) {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  return (
    <View style={{ flex: 1, backgroundColor: DS.bg }}>
      <Animated.View style={{ height: 160, backgroundColor: DS.surfaceHigh, opacity: pulseAnim }} />
      <View style={{ paddingHorizontal: 16, marginTop: -40 }}>
        <Animated.View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: DS.surface, borderWidth: 3, borderColor: DS.bg, opacity: pulseAnim }} />
        <Animated.View style={{ width: '60%', height: 28, borderRadius: 8, backgroundColor: DS.surfaceHigh, opacity: pulseAnim, marginTop: 12, marginBottom: 8 }} />
        <Animated.View style={{ width: '40%', height: 16, borderRadius: 8, backgroundColor: DS.surfaceHigh, opacity: pulseAnim, marginBottom: 24 }} />
        
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: DS.border, paddingBottom: 12 }}>
          <Animated.View style={{ width: 60, height: 20, borderRadius: 8, backgroundColor: DS.surfaceHigh, opacity: pulseAnim }} />
          <Animated.View style={{ width: 60, height: 20, borderRadius: 8, backgroundColor: DS.surfaceHigh, opacity: pulseAnim }} />
          <Animated.View style={{ width: 60, height: 20, borderRadius: 8, backgroundColor: DS.surfaceHigh, opacity: pulseAnim }} />
        </View>

        <View style={{ gap: 12 }}>
          <Animated.View style={{ width: '100%', height: 60, borderRadius: 12, backgroundColor: DS.surfaceHigh, opacity: pulseAnim }} />
          <Animated.View style={{ width: '100%', height: 60, borderRadius: 12, backgroundColor: DS.surfaceHigh, opacity: pulseAnim }} />
          <Animated.View style={{ width: '100%', height: 60, borderRadius: 12, backgroundColor: DS.surfaceHigh, opacity: pulseAnim }} />
        </View>
      </View>
    </View>
  );
}

const TeamProfileScreen = ({ navigation, route }) => {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  // The shared control language. This screen had its OWN tab pill — a lime fill
  // with DS.bg text — which is the fourth copy of a control Matches, Teams and
  // Tournaments already share. Same job, so the same control.
  const C = useThemedStyles(makeControls);
  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();
  const me = useCurrentUser();
  const { teamId } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);          // logo/cover upload in flight
  const [data, setData] = useState(null);
  // The STATS chip on a team card deep-links straight to this tab; everything
  // else opens on the squad.
  const [tab, setTab] = useState(route.params?.initialTab || 'matches');

  // Add-member (by mobile number) + add-award inline forms
  const [addingMember, setAddingMember] = useState(false);
  // Link an existing app user by their registered mobile number
  const [searchPhone, setSearchPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState(null);
  const [awardModal, setAwardModal] = useState(false);
  const [award, setAward] = useState({ title: '', year: '', note: '' });
  // Follow + join state
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [joining, setJoining] = useState(false);
  // Member-management modal (role, jersey, captaincy + admin/owner/remove)
  const [manageMember, setManageMember] = useState(null);
  const [manageForm, setManageForm] = useState({ role: '', jersey: '', isCaptain: false, isViceCaptain: false });
  const [savingMember, setSavingMember] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  const team = data?.team;
  // Admin rights come from the server: the owner plus any promoted member. This
  // gates every management control (logo, cover, edit, members, awards, gallery).
  const isAdmin = !!data?.viewerIsAdmin;
  // The caller's own membership (a player row linked to their user id) — enables
  // the self-serve "Leave team" option for members who aren't the admin.
  const myMembership = (data?.members || []).find((m) => m.userId && m.userId === me?.id);
  const sport = team?.sport || 'cricket';
  const isCricket = sport === 'cricket';
  const sportIcon = sportMeta(sport).icon;
  const tabs = [
    ['matches', 'Matches', sportIcon],
    ['squad', 'Squad', 'account-group'],
    ['form', 'Stats', 'chart-line'],
    ['leaders', 'Leaderboard', 'podium'],
    ['standings', 'Standings', 'trophy-variant'],
    ['honours', 'Honours', 'medal'],
    ['gallery', 'Gallery', 'image-multiple'],
  ];
  // Derived, not a second hand-written list. It was one, and adding a tab above
  // left the swipe stepping through the old six — so the new tab existed but
  // could only be reached by tapping it, and swiping jumped over it as though
  // it weren't there.
  const TAB_KEYS = tabs.map(([key]) => key);
  // Swipe steps the tabs, as it does on every other list screen in the app.
  const tabSwipe = useFilterSwipe(TAB_KEYS, tab, setTab);

  const joinStatus = data?.viewerJoinStatus || 'none';
  const isOwner = joinStatus === 'owner';
  const isOutsider = joinStatus !== 'member' && joinStatus !== 'owner' && !isAdmin;
  // Team chat is for people ON the team — owner, admin, or a plain linked member.
  const canChat = isOwner || isAdmin || joinStatus === 'member';

  useLayoutEffect(() => {
    // Hidden like the rest of this stack. Unlike PlayerInsights and
    // TeamInsights this screen had NO back affordance of its own — it leaned
    // entirely on the navigator's — so one is drawn over the cover below.
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const load = useCallback(async () => {
    const res = await legendsApi.getTeamProfile(teamId);
    if (res.success) {
      setData(res.data);
      setFollowing(!!res.data.viewerIsFollowing);
      setFollowerCount(res.data.followerCount || 0);
    } else showToast(res.error || 'Could not load team', 'error');
    setLoading(false);
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  // Coming back from Edit Team Profile — or from a squad change, or an award —
  // the screen has to show what was just saved. It loaded on mount only, so a
  // renamed team kept its old name until the screen was left and re-entered.
  // The first focus is skipped because mount already fetched.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    load();
  }, [load]));

  // ── Admin actions ──────────────────────────────────────────────────────────
  const changeImage = async (field) => {
    if (busy) return;
    setBusy(true);
    const r = await pickAndUploadImage('teams');
    if (r.url) {
      const res = await legendsApi.updateTeam(teamId, { [field]: r.url });
      if (res.success) { await load(); showToast(field === 'logoUrl' ? 'Logo updated' : 'Cover updated', 'success'); }
      else showToast(res.error || 'Save failed', 'error');
    } else if (r.error) showToast(r.error, 'error');
    setBusy(false);
  };

  // Look up a registered Local Legends user by mobile number.
  const searchUser = async () => {
    const phone = searchPhone.replace(/\D/g, '');
    if (phone.length < 8) return showToast('Enter a valid mobile number.', 'error');
    setSearching(true);
    setFoundUser(null);
    const res = await legendsApi.searchUserByPhone(phone);
    setSearching(false);
    if (res.success && res.data) setFoundUser(res.data);
    else showToast(res.error || 'No Local Legends user with that number.', 'error');
  };

  // Add the found app user to this team as a player, linked to their account.
  const addFoundMember = async () => {
    if (!foundUser) return;
    const name = `${foundUser.firstName || ''} ${foundUser.lastName || ''}`.trim() || 'Player';
    setAddingMember(true);
    const res = await legendsApi.createPlayer({ name, role: 'Player', teamId, sport: team?.sport, userId: foundUser.id });
    setAddingMember(false);
    if (res.success) { setSearchPhone(''); setFoundUser(null); await load(); showToast(`${name} added.`, 'success'); }
    else showToast(res.error || 'Failed to add member', 'error');
  };

  const removeMember = async (player) => {
    const res = await legendsApi.deletePlayer(player.id);
    if (res.success) { await load(); showToast(`${player.name} removed.`, 'success'); }
    else showToast(res.error || 'Failed to remove', 'error');
  };

  const toggleFollow = async () => {
    const next = !following;
    setFollowing(next);
    setFollowerCount((c) => Math.max(0, c + (next ? 1 : -1)));
    const res = next ? await legendsApi.followTeam(teamId) : await legendsApi.unfollowTeam(teamId);
    if (!res.success) {   // revert on failure
      setFollowing(!next);
      setFollowerCount((c) => Math.max(0, c + (next ? -1 : 1)));
      showToast(res.error || 'Could not update', 'error');
    }
  };

  const requestJoin = async () => {
    setJoining(true);
    const res = await legendsApi.requestToJoinTeam(teamId);
    setJoining(false);
    if (res.success) { await load(); showToast('Request sent to the team admins.', 'success'); }
    else showToast(res.error || 'Could not send request', 'error');
  };

  const approveJoin = async (userId, name) => {
    const res = await legendsApi.approveTeamJoinRequest(teamId, userId);
    if (res.success) { await load(); showToast(`${name} added to the team.`, 'success'); }
    else showToast(res.error || 'Failed', 'error');
  };

  const rejectJoin = async (userId) => {
    const res = await legendsApi.rejectTeamJoinRequest(teamId, userId);
    if (res.success) await load();
    else showToast(res.error || 'Failed', 'error');
  };

  const openMember = (m) => navigation.navigate('PlayerInsights', { playerId: m.id });

  const openManage = (m) => {
    setManageForm({
      role: m.role || '', jersey: m.jerseyNumber != null ? String(m.jerseyNumber) : '',
      isCaptain: !!m.isCaptain, isViceCaptain: !!m.isViceCaptain,
    });
    setManageMember(m);
  };
  const closeManage = () => setManageMember(null);

  const saveMember = async () => {
    setSavingMember(true);
    const res = await legendsApi.updatePlayer(manageMember.id, {
      role: manageForm.role.trim() || undefined,
      jerseyNumber: manageForm.jersey === '' ? null : parseInt(manageForm.jersey, 10),
      isCaptain: manageForm.isCaptain,
      isViceCaptain: manageForm.isViceCaptain,
    });
    setSavingMember(false);
    if (res.success) { closeManage(); await load(); showToast('Member updated.', 'success'); }
    else showToast(res.error || 'Failed to save', 'error');
  };

  const transferOwner = (m) => {
    Alert.alert(
      'Transfer ownership',
      `Make ${m.name} the team owner? You'll stay on as an admin.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer', style: 'destructive',
          onPress: async () => {
            const res = await legendsApi.transferTeamOwner(teamId, m.userId);
            if (res.success) { await load(); showToast(`${m.name} is now the owner.`, 'success'); }
            else showToast(res.error || 'Failed', 'error');
          },
        },
      ],
    );
  };

  const deleteTeam = () => {
    Alert.alert(
      'Delete team',
      `Permanently delete ${team?.name}? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const res = await legendsApi.deleteTeam(teamId);
            if (res.success) { showToast('Team deleted.', 'success'); navigation.goBack(); }
            else showToast(res.error || 'Could not delete', 'error');
          },
        },
      ],
    );
  };

  const setMemberAdmin = async (player, makeAdmin) => {
    const res = await legendsApi.setTeamMemberAdmin(teamId, player.id, makeAdmin);
    if (res.success) {
      await load();
      showToast(makeAdmin ? `${player.name} is now an admin.` : `${player.name} is no longer an admin.`, 'success');
    } else showToast(res.error || 'Failed', 'error');
  };

  const leaveTeam = () => {
    Alert.alert(
      'Leave team',
      `Leave ${team?.name}? You can be added back later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave', style: 'destructive',
          onPress: async () => {
            const res = await legendsApi.leaveTeam(teamId);
            if (res.success) { showToast('You left the team.', 'success'); navigation.goBack(); }
            else showToast(res.error || 'Could not leave', 'error');
          },
        },
      ],
    );
  };

  const saveAward = async () => {
    const title = award.title.trim();
    if (!title) return showToast('Award title is required.', 'error');
    const entry = { title, year: award.year.trim() || undefined, note: award.note.trim() || undefined };
    const next = [...(data.awards || []), entry];
    const res = await legendsApi.updateTeam(teamId, { awards: next });
    if (res.success) {
      setAwardModal(false); setAward({ title: '', year: '', note: '' });
      await load(); showToast('Award added.', 'success');
    } else showToast(res.error || 'Failed to add award', 'error');
  };

  const removeAward = async (index) => {
    const next = (data.awards || []).filter((_, i) => i !== index);
    const res = await legendsApi.updateTeam(teamId, { awards: next });
    if (res.success) { await load(); } else showToast(res.error || 'Failed', 'error');
  };

  const addPhoto = async () => {
    if (busy) return;
    setBusy(true);
    const r = await pickAndUploadImage('gallery');
    if (r.url) {
      const res = await legendsApi.addGalleryPhoto({ url: r.url, teamId });
      if (res.success) { await load(); showToast('Photo added.', 'success'); }
      else showToast(res.error || 'Failed to add photo', 'error');
    } else if (r.error) showToast(r.error, 'error');
    setBusy(false);
  };

  const removePhoto = async (photo) => {
    const res = await legendsApi.deleteGalleryPhoto(photo.id);
    if (res.success) await load();
    else showToast(res.error || 'Failed', 'error');
  };

  const openTeamChat = async () => {
    if (openingChat) return;
    setOpeningChat(true);
    const res = await legendsApi.openTeamChat(teamId);
    setOpeningChat(false);
    if (res.success) navigation.navigate('Chat', { chatId: res.chatRoomId, chatName: res.name });
    else showToast(res.error || 'Could not open team chat', 'error');
  };

  if (loading) {
    return <TeamProfileSkeleton DS={DS} />;
  }
  if (!team) {
    return <View style={[styles.container, styles.center]}><Text style={styles.muted}>Team not found.</Text></View>;
  }

  const stats = data.stats || {};

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      {...hideTabBar}
      contentContainerStyle={{ paddingBottom: tabClear + 24 }}>

      {/* ── Cover + logo header ── */}
      <View style={styles.coverWrap}>
        {team.coverUrl
          ? <Image source={{ uri: team.coverUrl }} style={styles.cover} />
          : <View style={[styles.cover, styles.coverEmpty]} />}
        {/* Floats over the cover: without it, hiding the navigator header would
            leave this screen with no way out. */}
        <TouchableOpacity style={styles.coverBackBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity style={styles.coverEditBtn} onPress={() => changeImage('coverUrl')} disabled={busy}>
            <Icon name="camera" size={16} color="#fff" />
            <Text style={styles.coverEditTxt}>Cover</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.identityRow}>
        <TouchableOpacity
          activeOpacity={isAdmin ? 0.8 : 1}
          onPress={isAdmin ? () => changeImage('logoUrl') : undefined}
          style={styles.logoWrap}>
          {team.logoUrl
            ? <Image source={{ uri: team.logoUrl }} style={styles.logo} />
            : <View style={[styles.logo, styles.logoEmpty]}><Text style={styles.logoInitial}>{initials(team.name)}</Text></View>}
          {isAdmin && (
            <View style={styles.logoBadge}>
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="camera" size={13} color="#fff" />}
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.identityText}>
          <Text style={styles.teamName} numberOfLines={1}>{team.name}</Text>
          <Text style={styles.teamMeta} numberOfLines={1}>
            {/* City, then whichever of state and country adds something — a team
                in "Chennai, Tamil Nadu" reads better than one in "Chennai", and
                a national side has only the country. */}
            {[team.city, team.state, team.city || team.state ? null : team.country]
              .filter(Boolean).join(', ') || (team.sport || 'cricket')}
            {`  ·  ${followerCount} follower${followerCount === 1 ? '' : 's'}`}
          </Text>
        </View>

        <View style={styles.identityActions}>
          {canChat && (
            <TouchableOpacity style={styles.chatBtn} onPress={openTeamChat} disabled={openingChat}>
              {openingChat ? <ActivityIndicator size="small" color={DS.lime} /> : <Icon name="chat-outline" size={18} color={DS.lime} />}
            </TouchableOpacity>
          )}
          {isAdmin && (
            <TouchableOpacity style={styles.editProfileBtn} onPress={() => navigation.navigate('EditTeamProfile', { teamId })}>
              <Icon name="pencil" size={14} color={DS.lime} />
              <Text style={styles.editProfileTxt}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {team.bio ? <Text style={styles.bio}>{team.bio}</Text> : null}

      {/* Founded, ground and colours. Edit Team Profile has always asked for
          these — along with state and country above — and the profile drew none
          of them, so they were typed once and never seen. Each appears only when
          it has a value, so a team that filled in nothing looks as it did. */}
      {(team.foundedYear || team.homeGround || team.colors) && (
        <View style={styles.factRow}>
          {!!team.foundedYear && (
            <View style={styles.fact}>
              <Icon name="calendar-star" size={13} color={DS.textMuted} />
              <Text style={styles.factText}>Est. {team.foundedYear}</Text>
            </View>
          )}
          {!!team.homeGround && (
            <View style={styles.fact}>
              <Icon name="stadium-variant" size={13} color={DS.textMuted} />
              <Text style={styles.factText} numberOfLines={1}>{team.homeGround}</Text>
            </View>
          )}
          {!!team.colors && (
            <View style={styles.fact}>
              <Icon name="palette-outline" size={13} color={DS.textMuted} />
              <Text style={styles.factText} numberOfLines={1}>{team.colors}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Follow / Request-to-join (for people not on the team) ── */}
      {isOutsider && (
        <View style={styles.ctaRow}>
          <TouchableOpacity style={[styles.ctaBtn, following && styles.ctaBtnActive]} onPress={toggleFollow}>
            <Icon name={following ? 'heart' : 'heart-outline'} size={16} color={following ? DS.bg : DS.lime} />
            <Text style={[styles.ctaTxt, following && { color: DS.bg }]}>{following ? 'Following' : 'Follow'}</Text>
          </TouchableOpacity>
          {joinStatus === 'pending' ? (
            <View style={[styles.ctaBtn, styles.ctaBtnMuted]}>
              <Icon name="clock-outline" size={16} color={DS.textMuted} />
              <Text style={[styles.ctaTxt, { color: DS.textMuted }]}>Requested</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.ctaBtnPrimary} onPress={requestJoin} disabled={joining}>
              {joining ? <ActivityIndicator size="small" color={DS.bg} />
                : <><Icon name="account-plus" size={16} color={DS.bg} /><Text style={[styles.ctaTxt, { color: DS.bg }]}>Request to Join</Text></>}
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Stats strip ── */}
      <View style={styles.statStrip}>
        <Stat label="Matches" value={stats.matches ?? 0} styles={styles} />
        <View style={styles.statSep} />
        <Stat label="Wins" value={stats.wins ?? 0} styles={styles} />
        <View style={styles.statSep} />
        <Stat label="Win %" value={`${stats.winRate ?? 0}%`} styles={styles} />
        <View style={styles.statSep} />
        <Stat label="Rank" value={stats.rank ? `#${stats.rank}` : '—'} styles={styles} />
      </View>

      {/* ── Tabs ── */}
      {/* The Pavilion filter bar, not this screen's own pill. Counts ride on the
          two tabs that have a number worth knowing before you open them. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={styles.tabRow} contentContainerStyle={[C.filterBar, { flexDirection: 'row', marginBottom: 0 }]}>
        {tabs.map(([key, label, icon]) => {
          const on = tab === key;
          const count = key === 'squad' ? (data.members || []).length
            : key === 'matches' ? (data.recentMatches || []).length : null;
          return (
          <TouchableOpacity key={key} onPress={() => setTab(key)} style={[C.filterChip, on && C.filterChipActive]}>
            <Icon name={icon} size={13} color={on ? DS.lime : DS.textMuted} />
            <Text style={[C.filterText, on && C.filterTextActive]}>{label}</Text>
            {count > 0 && (
              <View style={[C.filterCount, on && C.filterCountOn]}>
                <Text style={[C.filterCountText, on && C.filterCountTextOn]}>{count}</Text>
              </View>
            )}
          </TouchableOpacity>);
        })}
      </ScrollView>

      {/* ── Tab content ──
          Swipe steps the tabs, the same gesture the Matches, Teams,
          Tournaments and Pavilion screens use for their filter rows. ── */}
      <GestureDetector gesture={tabSwipe}>
      <View style={styles.section}>
        {tab === 'squad' && (
          <SquadTab
            members={data.members || []} isAdmin={isAdmin} styles={styles} DS={DS}
            addingMember={addingMember}
            searchPhone={searchPhone} setSearchPhone={setSearchPhone} searchUser={searchUser}
            searching={searching} foundUser={foundUser} setFoundUser={setFoundUser} addFoundMember={addFoundMember}
            canLeave={!!myMembership && !myMembership.isOwner} onLeave={leaveTeam}
            joinRequests={data.joinRequests || []} onApprove={approveJoin} onReject={rejectJoin}
            onOpenMember={openMember} isOwner={isOwner} onManage={openManage} onDelete={deleteTeam} />
        )}
        {tab === 'matches' && (
          <MatchesTab matches={data.recentMatches || []} teamId={teamId} navigation={navigation} styles={styles} DS={DS} />
        )}
        {/* ONE mount across both tabs, deliberately. Same component in the same
            slot means React keeps the instance when you switch, so the filters
            you set on Stats are still set on Leaderboard and neither tab
            re-fetches — one period, one format, one ground, applied to
            everything, which is the whole point of that filter row. */}
        {(tab === 'form' || tab === 'leaders') && (
          <TeamStats teamId={teamId} show={tab === 'form' ? 'stats' : 'leaderboards'} />
        )}
        {tab === 'standings' && (
          <StandingsTab rows={data.leaderboard || []} styles={styles} DS={DS} />
        )}
        {tab === 'honours' && (
          <HonoursTab
            achievements={data.achievements} awards={data.awards || []} isAdmin={isAdmin}
            styles={styles} DS={DS} onAdd={() => setAwardModal(true)} onRemove={removeAward}
            stats={stats} isCricket={isCricket} />
        )}
        {tab === 'gallery' && (
          <GalleryTab photos={data.gallery || []} isAdmin={isAdmin} styles={styles} DS={DS}
            onAdd={addPhoto} onRemove={removePhoto} busy={busy} />
        )}
      </View>
      </GestureDetector>

      {/* ── Add-award modal ── */}
      <Modal visible={awardModal} transparent animationType="fade" onRequestClose={() => setAwardModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Award</Text>
            <TextInput style={styles.modalInput} placeholder="Title (e.g. League Champions)"
              placeholderTextColor={DS.textMuted} value={award.title}
              onChangeText={(t) => setAward({ ...award, title: t })} autoFocus />
            <TextInput style={styles.modalInput} placeholder="Year (optional)"
              placeholderTextColor={DS.textMuted} value={award.year} keyboardType="numeric"
              onChangeText={(t) => setAward({ ...award, year: t })} />
            <TextInput style={[styles.modalInput, styles.modalArea]} placeholder="Note (optional)"
              placeholderTextColor={DS.textMuted} value={award.note} multiline
              onChangeText={(t) => setAward({ ...award, note: t })} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setAwardModal(false)}>
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={saveAward}>
                <Text style={styles.modalConfirmTxt}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Manage-member modal (role, jersey, captaincy + admin/owner/remove) ── */}
      <Modal visible={!!manageMember} transparent animationType="fade" onRequestClose={closeManage}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{manageMember?.name}</Text>

            <Text style={styles.fieldLabel}>Role</Text>
            {/* From the sports registry, which already knows every sport's
                roles — football has Striker/Midfielder/Defender/Goalkeeper,
                badminton has Singles/Doubles. This offered four CRICKET roles
                and was gated on isCricket, so a football squad got a "Role"
                heading with nothing under it and no way to set one at all.
                It also said "Keeper" where Find Players says "Wicketkeeper";
                one list means one word. */}
            <View style={styles.chipWrap}>
              {(getFind(sport)?.roles || []).map((r) => (
                <TouchableOpacity key={r} onPress={() => setManageForm((f) => ({ ...f, role: r }))}
                  style={[styles.roleChip, manageForm.role === r && styles.roleChipOn]}>
                  <Text style={[styles.roleChipTxt, manageForm.role === r && styles.roleChipTxtOn]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* No free-text box under them any more. The chips ARE the
                vocabulary — all 18 sports in the registry carry a role list —
                and a box beneath them saying "Role" is an invitation to type
                something else. That invitation is where "Bat", "Bowl",
                "Batsman", "allrounder" and "Wicket Keeper" came from: ten
                spellings of five roles across 278 players, now folded back to
                four. Cleaning that up is worth nothing if the tap stays on. */}

            <Text style={styles.fieldLabel}>Jersey number</Text>
            <TextInput style={styles.modalInput} placeholder="e.g. 7" placeholderTextColor={DS.textMuted}
              keyboardType="number-pad" maxLength={3} value={manageForm.jersey}
              onChangeText={(t) => setManageForm((f) => ({ ...f, jersey: t.replace(/[^0-9]/g, '') }))} />

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLbl}>Captain</Text>
              <Switch value={manageForm.isCaptain} trackColor={{ true: DS.lime }}
                onValueChange={(v) => setManageForm((f) => ({ ...f, isCaptain: v, isViceCaptain: v ? false : f.isViceCaptain }))} />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLbl}>Vice-captain</Text>
              <Switch value={manageForm.isViceCaptain} trackColor={{ true: DS.lime }}
                onValueChange={(v) => setManageForm((f) => ({ ...f, isViceCaptain: v, isCaptain: v ? false : f.isCaptain }))} />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={closeManage}>
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={saveMember} disabled={savingMember}>
                {savingMember ? <ActivityIndicator size="small" color={DS.bg} /> : <Text style={styles.modalConfirmTxt}>Save</Text>}
              </TouchableOpacity>
            </View>

            {/* Secondary admin actions */}
            {manageMember && (
              <View style={styles.manageActions}>
                {!manageMember.isOwner && !!manageMember.userId && (
                  <TouchableOpacity style={styles.manageAction}
                    onPress={() => { const m = manageMember; closeManage(); setMemberAdmin(m, !m.isAdmin); }}>
                    <Icon name={manageMember.isAdmin ? 'shield-off-outline' : 'shield-account-outline'} size={18} color={DS.textPrimary} />
                    <Text style={styles.manageActionTxt}>{manageMember.isAdmin ? 'Remove admin' : 'Make admin'}</Text>
                  </TouchableOpacity>
                )}
                {isOwner && !manageMember.isOwner && !!manageMember.userId && (
                  <TouchableOpacity style={styles.manageAction}
                    onPress={() => { const m = manageMember; closeManage(); transferOwner(m); }}>
                    <Icon name="crown-outline" size={18} color={DS.lime} />
                    <Text style={styles.manageActionTxt}>Make owner</Text>
                  </TouchableOpacity>
                )}
                {!manageMember.isOwner && (
                  <TouchableOpacity style={styles.manageAction}
                    onPress={() => { const m = manageMember; closeManage(); removeMember(m); }}>
                    <Icon name="account-remove-outline" size={18} color={DS.danger} />
                    <Text style={[styles.manageActionTxt, { color: DS.danger }]}>Remove from team</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

// ── Small presentational pieces ────────────────────────────────────────────────
const Stat = ({ label, value, styles }) => (
  <View style={styles.statBlock}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const SquadTab = ({ members, isAdmin, styles, DS, addingMember, searchPhone, setSearchPhone, searchUser, searching, foundUser, setFoundUser, addFoundMember, canLeave, onLeave, joinRequests, onApprove, onReject, onOpenMember, isOwner, onManage, onDelete }) => (
  <View>
    {/* Pending join requests — admins only. */}
    {isAdmin && joinRequests.length > 0 && (
      <View style={styles.reqBox}>
        <Text style={styles.blockLabel}>Join Requests ({joinRequests.length})</Text>
        {joinRequests.map((r) => (
          <View key={r.userId} style={styles.reqRow}>
            <View style={styles.memberAvatar}>
              {r.avatarUrl ? <Image source={{ uri: r.avatarUrl }} style={styles.reqAvatarImg} />
                : <Text style={styles.memberInitial}>{initials(r.name)}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{r.name}</Text>
              {r.city ? <Text style={styles.memberRole}>{r.city}</Text> : null}
            </View>
            <TouchableOpacity style={styles.reqApprove} onPress={() => onApprove(r.userId, r.name)}>
              <Icon name="check" size={18} color={DS.bg} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.reqReject} onPress={() => onReject(r.userId)}>
              <Icon name="close" size={18} color={DS.textMuted} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    )}

    {isAdmin && (
      <View>
        {/* Add a member by their registered mobile number, linked to their account. */}
        <View style={styles.addRow}>
          <TextInput style={styles.addInput} placeholder="Add member by mobile number"
            placeholderTextColor={DS.textMuted} value={searchPhone}
            onChangeText={(t) => { setSearchPhone(t); setFoundUser(null); }}
            keyboardType="phone-pad" returnKeyType="search" onSubmitEditing={searchUser} />
          <TouchableOpacity style={[styles.addBtn, { width: 'auto', paddingHorizontal: 14 }]} onPress={searchUser} disabled={searching}>
            {searching ? <ActivityIndicator size="small" color={DS.bg} /> : <Icon name="magnify" size={20} color={DS.bg} />}
          </TouchableOpacity>
        </View>

        {foundUser && (
          <View style={styles.foundCard}>
            <View style={styles.memberAvatar}>
              {foundUser.avatarUrl ? <Image source={{ uri: foundUser.avatarUrl }} style={styles.reqAvatarImg} />
                : <Text style={styles.memberInitial}>{initials(`${foundUser.firstName || ''} ${foundUser.lastName || ''}`)}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{`${foundUser.firstName || ''} ${foundUser.lastName || ''}`.trim() || 'Player'}</Text>
              <Text style={styles.memberRole}>{foundUser.phone}</Text>
            </View>
            <TouchableOpacity style={[styles.addBtn, { width: 'auto', paddingHorizontal: 16 }]} onPress={addFoundMember} disabled={addingMember}>
              {addingMember ? <ActivityIndicator size="small" color={DS.bg} /> : <Text style={{ color: DS.bg, fontWeight: '800' }}>Add</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    )}
    {members.length === 0 && <Text style={styles.emptyTxt}>No members yet.</Text>}
    {members.map((m) => (
      <View key={m.id} style={styles.memberRow}>
        <TouchableOpacity style={styles.memberMain} onPress={() => onOpenMember(m)} activeOpacity={0.7}>
          <View style={styles.memberAvatar}>
            {/* The face when there is one, the initials when there isn't — the
                join-request rows above have always done this, and the squad
                looked oddly anonymous underneath them. */}
            {m.avatarUrl
              ? <Image source={{ uri: m.avatarUrl }} style={styles.memberAvatarImg} />
              : <Text style={styles.memberInitial}>{initials(m.name)}</Text>}
            {m.jerseyNumber != null && (
              <View style={styles.jerseyBadge}><Text style={styles.jerseyTxt}>{m.jerseyNumber}</Text></View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.memberNameRow}>
              <Text style={styles.memberName}>{m.name}</Text>
              {m.isCaptain && <View style={styles.capBadge}><Text style={styles.capTxt}>C</Text></View>}
              {m.isViceCaptain && <View style={styles.viceBadge}><Text style={styles.viceTxt}>VC</Text></View>}
              {m.isOwner
                ? <View style={styles.roleBadge}><Text style={styles.roleBadgeTxt}>OWNER</Text></View>
                : m.isAdmin
                  ? <View style={styles.roleBadge}><Text style={styles.roleBadgeTxt}>ADMIN</Text></View>
                  : null}
            </View>
            <Text style={styles.memberRole}>{m.role || 'Player'}</Text>
          </View>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity onPress={() => onManage(m)}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} style={styles.memberAction}>
            <Icon name="pencil-outline" size={19} color={DS.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    ))}
    {canLeave && (
      <TouchableOpacity style={styles.leaveBtn} onPress={onLeave}>
        <Icon name="exit-run" size={18} color={DS.danger} />
        <Text style={styles.leaveTxt}>Leave Team</Text>
      </TouchableOpacity>
    )}
    {isOwner && (
      <TouchableOpacity style={styles.leaveBtn} onPress={onDelete}>
        <Icon name="trash-can-outline" size={18} color={DS.danger} />
        <Text style={styles.leaveTxt}>Delete Team</Text>
      </TouchableOpacity>
    )}
  </View>
);


const MatchesTab = ({ matches, teamId, navigation, styles, DS }) => {
  if (matches.length === 0) return <Text style={styles.emptyTxt}>No matches yet.</Text>;

  const grouped = {};
  for (const m of matches) {
    const t = m.tournamentName || 'OTHER MATCHES';
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(m);
  }

  return (
    <View style={{ backgroundColor: DS.bg }}>
      {Object.entries(grouped).map(([tournamentName, tourneyMatches]) => (
        <View key={tournamentName} style={{ marginBottom: 12 }}>
          <View style={{ backgroundColor: DS.surface, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: DS.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{tournamentName}</Text>
            <Icon name="chevron-right" size={18} color={DS.textMuted} />
          </View>
          
          {tourneyMatches.map((m, i) => {
            const isTeam1 = m.team1Id === teamId;
            const live = m.status === 'live';
            const done = m.status === 'completed';
            const scheduled = m.status === 'scheduled';
            
            // Format match label like "3rd T20I • Harare"
            let matchLabel = '';
            if (m.matchType) matchLabel += m.matchType;
            if (m.venue) matchLabel += (matchLabel ? ' • ' : '') + m.venue;
            if (!matchLabel) matchLabel = live ? 'Live now' : scheduled ? 'Scheduled' : 'Match';

            const d = m.startTime ? new Date(m.startTime) : null;
            const dateStr = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            if (dateStr && matchLabel.indexOf(dateStr) === -1) {
                matchLabel += ` • ${dateStr}`;
            }
            
            return (
              <TouchableOpacity key={m.id} style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: DS.border }}
                onPress={() => !m.isTournamentMatchOnly && navigation.navigate('MatchInsights', { matchId: m.id })}>
                
                <Text style={{ color: DS.textMuted, fontSize: 12, marginBottom: 12 }}>{matchLabel}</Text>
                
                {/* Team 1 Row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {m.team1?.logoUrl ? <Image source={{ uri: m.team1.logoUrl }} style={{ width: 20, height: 20, borderRadius: 10, marginRight: 8 }} />
                      : <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: DS.surface, marginRight: 8 }} />}
                    <Text style={{ color: DS.textPrimary, fontSize: 15, fontWeight: isTeam1 ? '700' : '400' }}>{m.team1?.name || 'TBD'}</Text>
                  </View>
                  <Text style={{ color: DS.textPrimary, fontSize: 15, fontWeight: '600' }}>{m.score1 || (scheduled ? '—' : '')}</Text>
                </View>
                
                {/* Team 2 Row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {m.team2?.logoUrl ? <Image source={{ uri: m.team2.logoUrl }} style={{ width: 20, height: 20, borderRadius: 10, marginRight: 8 }} />
                      : <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: DS.surface, marginRight: 8 }} />}
                    <Text style={{ color: DS.textPrimary, fontSize: 15, fontWeight: !isTeam1 ? '700' : '400' }}>{m.team2?.name || 'TBD'}</Text>
                  </View>
                  <Text style={{ color: DS.textPrimary, fontSize: 15, fontWeight: '600' }}>{m.score2 || (scheduled ? '—' : '')}</Text>
                </View>
                
                {/* Result or Status string */}
                <Text style={{ color: live ? DS.danger : DS.link || DS.lime, fontSize: 13, fontWeight: '500' }}>
                  {m.result || (live ? 'Live' : scheduled ? (d ? d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Scheduled') : 'No result')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const StandingsTab = ({ rows, styles, DS }) => {
  if (rows.length === 0) return <Text style={styles.emptyTxt}>No standings yet.</Text>;
  return (
    <View>
      <View style={[styles.tableRow, styles.tableHead]}>
        <Text style={[styles.thRank]}>#</Text>
        <View style={styles.tdLogoSpacer} />
        <Text style={[styles.thTeam]}>Team</Text>
        <Text style={styles.thNum}>P</Text>
        <Text style={styles.thNum}>W</Text>
        <Text style={styles.thNum}>Win%</Text>
      </View>
      {rows.map((r) => (
        <View key={r.id} style={[styles.tableRow, r.isCurrent && styles.tableRowActive]}>
          <Text style={styles.tdRank}>{r.rank}</Text>
          {/* The crest. GET /teams/:id/profile has been sending logoUrl on every
              standings row since the leaderboard was written and this table
              never read it — so a table of clubs was a table of names. */}
          <View style={styles.tdLogo}>
            {r.logoUrl
              ? <Image source={{ uri: r.logoUrl }} style={styles.tdLogoImg} />
              : <Text style={styles.tdLogoText}>{(r.name || '?').charAt(0).toUpperCase()}</Text>}
          </View>
          <Text style={[styles.tdTeam, r.isCurrent && styles.tdTeamActive]} numberOfLines={1}>{r.name}</Text>
          <Text style={styles.tdNum}>{r.matches}</Text>
          <Text style={styles.tdNum}>{r.wins}</Text>
          <Text style={styles.tdNum}>{r.winRate}%</Text>
        </View>
      ))}
    </View>
  );
};

const HonoursTab = ({ achievements, awards, isAdmin, styles, DS, onAdd, onRemove, stats, isCricket }) => (
  <View>
    {/* Season stats — cricket shows runs/wickets; other sports show points scored. */}
    <View style={styles.honourStats}>
      {isCricket ? (
        <>
          <View style={styles.honourStat}><Text style={styles.honourStatVal}>{stats.totalRuns ?? 0}</Text><Text style={styles.honourStatLbl}>Runs</Text></View>
          <View style={styles.honourStat}><Text style={styles.honourStatVal}>{stats.totalWickets ?? 0}</Text><Text style={styles.honourStatLbl}>Wickets</Text></View>
        </>
      ) : (
        <>
          <View style={styles.honourStat}><Text style={styles.honourStatVal}>{stats.pointsScored ?? 0}</Text><Text style={styles.honourStatLbl}>Scored</Text></View>
          <View style={styles.honourStat}><Text style={styles.honourStatVal}>{stats.matches ?? 0}</Text><Text style={styles.honourStatLbl}>Played</Text></View>
        </>
      )}
      <View style={styles.honourStat}><Text style={styles.honourStatVal}>{stats.squadSize ?? 0}</Text><Text style={styles.honourStatLbl}>Squad</Text></View>
    </View>

    {achievements ? (
      <View style={styles.achieveCard}>
        <Text style={styles.blockLabel}>Achievements</Text>
        <Text style={styles.achieveTxt}>{achievements}</Text>
      </View>
    ) : null}

    <View style={styles.blockHeader}>
      <Text style={styles.blockLabel}>Awards</Text>
      {isAdmin && (
        <TouchableOpacity style={styles.smallAdd} onPress={onAdd}>
          <Icon name="plus" size={14} color={DS.bg} /><Text style={styles.smallAddTxt}>Add</Text>
        </TouchableOpacity>
      )}
    </View>
    {awards.length === 0 && <Text style={styles.emptyTxt}>No awards yet.</Text>}
    {awards.map((a, i) => (
      <View key={i} style={styles.awardRow}>
        <Icon name="trophy" size={20} color={DS.lime} style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.awardTitle}>{a.title}{a.year ? ` · ${a.year}` : ''}</Text>
          {a.note ? <Text style={styles.awardNote}>{a.note}</Text> : null}
        </View>
        {isAdmin && (
          <TouchableOpacity onPress={() => onRemove(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close-circle-outline" size={20} color={DS.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    ))}
  </View>
);

const GalleryTab = ({ photos, isAdmin, styles, DS, onAdd, onRemove, busy }) => {
  const size = (SCREEN_W - 32 - GALLERY_GAP * (GALLERY_COLS - 1)) / GALLERY_COLS;
  const [viewer, setViewer] = useState(null);   // index of the open photo, or null
  return (
    <View>
      {isAdmin && (
        <TouchableOpacity style={styles.galleryAdd} onPress={onAdd} disabled={busy}>
          {busy ? <ActivityIndicator size="small" color={DS.lime} />
            : <><Icon name="image-plus" size={18} color={DS.lime} /><Text style={styles.galleryAddTxt}>Add photo</Text></>}
        </TouchableOpacity>
      )}
      {photos.length === 0 && <Text style={styles.emptyTxt}>No photos yet.</Text>}
      <View style={styles.galleryGrid}>
        {photos.map((p, i) => (
          <View key={p.id} style={{ width: size, height: size, marginBottom: GALLERY_GAP }}>
            <TouchableOpacity activeOpacity={0.85} onPress={() => setViewer(i)} style={{ flex: 1 }}>
              <Image source={{ uri: p.url }} style={styles.galleryImg} />
            </TouchableOpacity>
            {isAdmin && (
              <TouchableOpacity style={styles.galleryDel} onPress={() => onRemove(p)}>
                <Icon name="close" size={13} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      {/* Full-screen swipeable viewer */}
      <Modal visible={viewer !== null} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewer(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Icon name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <ScrollView
            horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            contentOffset={{ x: (viewer || 0) * SCREEN_W, y: 0 }}>
            {photos.map((p) => (
              <View key={p.id} style={styles.viewerPage}>
                <Image source={{ uri: p.url }} style={styles.viewerImg} resizeMode="contain" />
                {p.caption ? <Text style={styles.viewerCaption}>{p.caption}</Text> : null}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  muted: { color: DS.textMuted, fontSize: 15 },

  coverWrap: { height: 150, backgroundColor: DS.surfaceHigh },
  coverBackBtn: {
    position: 'absolute', left: 12, top: 48,
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    // Dark scrim so the arrow reads on a light cover photo too.
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cover: { width: '100%', height: 150 },
  coverEmpty: { backgroundColor: DS.surfaceHigh },
  coverEditBtn: {
    position: 'absolute', right: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  coverEditTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

  identityRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, marginTop: -34 },
  logoWrap: { width: 84, height: 84 },
  logo: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: DS.bg, backgroundColor: DS.surfaceHigh },
  logoEmpty: { alignItems: 'center', justifyContent: 'center' },
  logoInitial: { fontSize: 30, fontWeight: '900', color: DS.lime },
  logoBadge: {
    position: 'absolute', right: 0, bottom: 2, width: 26, height: 26, borderRadius: 13,
    backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: DS.bg,
  },
  identityText: { flex: 1, marginLeft: 12, marginBottom: 4 },
  teamName: { fontSize: 21, fontWeight: '900', color: DS.textPrimary },
  teamMeta: { fontSize: 13, color: DS.textMuted, marginTop: 2 },
  identityActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  chatBtn: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: DS.lime,
  },
  editProfileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: DS.lime, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  editProfileTxt: { color: DS.lime, fontSize: 12, fontWeight: '800' },
  bio: { color: DS.textVariant, fontSize: 14, lineHeight: 20, paddingHorizontal: 16, marginTop: 12 },
  factRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 10 },
  fact: {
    flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '48%',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.border,
  },
  factText: { fontSize: 12, fontWeight: '700', color: DS.textVariant, flexShrink: 1 },

  ctaRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 14 },
  ctaBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: DS.lime,
  },
  ctaBtnActive: { backgroundColor: DS.lime },
  ctaBtnMuted: { borderColor: DS.faint, backgroundColor: DS.surfaceHigh },
  ctaBtnPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 12, backgroundColor: DS.lime,
  },
  ctaTxt: { fontSize: 14, fontWeight: '800', color: DS.lime },

  statStrip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surface,
    marginHorizontal: 16, marginTop: 16, borderRadius: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: DS.faint,
  },
  statBlock: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, color: DS.textMuted, marginTop: 3, fontWeight: '600' },
  statSep: { width: 1, height: 26, backgroundColor: DS.faint },

  tabRow: { marginTop: 16 },

  section: { paddingHorizontal: 16, paddingTop: 16 },
  emptyTxt: { color: DS.textMuted, fontSize: 14, paddingVertical: 24, textAlign: 'center' },

  // Squad
  memberMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  reqBox: {
    backgroundColor: DS.surface, borderRadius: 14, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: DS.faint,
  },
  reqRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 12 },
  reqAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  reqApprove: { width: 34, height: 34, borderRadius: 17, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  reqReject: { width: 34, height: 34, borderRadius: 17, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  foundCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, marginBottom: 14,
    borderRadius: 12, backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.faint,
  },
  addInput: {
    flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: DS.textPrimary,
  },
  addBtn: { width: 46, borderRadius: 10, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center' },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: DS.faint,
  },
  memberAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#0a5227',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
    // The photo fills this circle absolutely, so it has to be clipped to it —
    // and the jersey badge sits outside, which is why it stays visible.
    overflow: 'visible',
  },
  memberAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  memberInitial: { color: '#fff', fontWeight: '800', fontSize: 14 },
  jerseyBadge: {
    position: 'absolute', bottom: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 3,
    backgroundColor: DS.surfaceHighest, borderWidth: 1.5, borderColor: DS.bg, alignItems: 'center', justifyContent: 'center',
  },
  jerseyTxt: { fontSize: 10, fontWeight: '900', color: DS.textPrimary },
  capBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center' },
  capTxt: { fontSize: 10, fontWeight: '900', color: DS.bg },
  viceBadge: { paddingHorizontal: 5, height: 18, borderRadius: 9, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  viceTxt: { fontSize: 9, fontWeight: '900', color: DS.lime },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberName: { color: DS.textPrimary, fontSize: 15, fontWeight: '600' },
  memberRole: { color: DS.textMuted, fontSize: 12, marginTop: 2 },
  memberAction: { paddingLeft: 10 },
  roleBadge: { backgroundColor: DS.surfaceHighest, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  roleBadgeTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8, color: DS.lime },
  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 20, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: DS.danger,
  },
  leaveTxt: { color: DS.danger, fontSize: 14, fontWeight: '800' },

  // Matches
  matchRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: DS.faint,
  },
  matchIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: DS.surfaceHigh,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  matchOpp: { color: DS.textPrimary, fontSize: 15, fontWeight: '700' },
  matchMeta: { color: DS.textMuted, fontSize: 12, marginTop: 2 },
  matchScore: { color: DS.textPrimary, fontSize: 13, fontWeight: '700', marginLeft: 8 },

  // Form / performers
  formRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  formPill: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  formPillTxt: { color: '#fff', fontSize: 13, fontWeight: '900' },
  perfRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: DS.faint,
  },
  perfName: { color: DS.textPrimary, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 12 },
  perfVal: { color: DS.lime, fontSize: 14, fontWeight: '800' },

  // Standings
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: DS.faint },
  tableHead: { borderBottomWidth: 1.5, borderBottomColor: DS.surfaceHighest },
  tableRowActive: { backgroundColor: DS.surfaceHigh, borderRadius: 8 },
  thRank: { width: 26, fontSize: 11, fontWeight: '800', color: DS.textMuted },
  thTeam: { flex: 1, fontSize: 11, fontWeight: '800', color: DS.textMuted },
  thNum: { width: 46, textAlign: 'center', fontSize: 11, fontWeight: '800', color: DS.textMuted },
  tdRank: { width: 26, fontSize: 14, fontWeight: '800', color: DS.textPrimary },
  tdLogo: {
    width: 22, height: 22, borderRadius: 11, marginRight: 8,
    backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  tdLogoImg: { width: 22, height: 22 },
  tdLogoText: { fontSize: 10, fontWeight: '800', color: DS.textVariant },
  tdLogoSpacer: { width: 22, marginRight: 8 },
  tdTeam: { flex: 1, fontSize: 14, color: DS.textPrimary },
  tdTeamActive: { fontWeight: '900', color: DS.lime },
  tdNum: { width: 46, textAlign: 'center', fontSize: 14, color: DS.textVariant, fontVariant: ['tabular-nums'] },

  // Honours
  honourStats: { flexDirection: 'row', backgroundColor: DS.surface, borderRadius: 14, paddingVertical: 14, marginBottom: 16, borderWidth: 1, borderColor: DS.faint },
  honourStat: { flex: 1, alignItems: 'center' },
  honourStatVal: { fontSize: 18, fontWeight: '900', color: DS.textPrimary },
  honourStatLbl: { fontSize: 11, color: DS.textMuted, marginTop: 3, fontWeight: '600' },
  achieveCard: { backgroundColor: DS.surface, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: DS.faint },
  blockLabel: { fontSize: 13, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  achieveTxt: { color: DS.textPrimary, fontSize: 14, lineHeight: 21, marginTop: 8 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  smallAdd: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: DS.lime, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  smallAddTxt: { color: DS.bg, fontSize: 12, fontWeight: '800' },
  awardRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: DS.faint },
  awardTitle: { color: DS.textPrimary, fontSize: 15, fontWeight: '700' },
  awardNote: { color: DS.textMuted, fontSize: 12, marginTop: 2 },

  // Gallery
  galleryAdd: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: DS.lime, borderStyle: 'dashed', borderRadius: 12,
    paddingVertical: 14, marginBottom: 14,
  },
  galleryAddTxt: { color: DS.lime, fontSize: 14, fontWeight: '700' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  galleryImg: { width: '100%', height: '100%', borderRadius: 10, backgroundColor: DS.surfaceHigh },
  galleryDel: {
    position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  viewerClose: {
    position: 'absolute', top: 44, right: 20, zIndex: 10, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  viewerPage: { width: SCREEN_W, alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: SCREEN_W, height: '80%' },
  viewerCaption: { position: 'absolute', bottom: 60, color: '#fff', fontSize: 14, paddingHorizontal: 24, textAlign: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: DS.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: DS.surfaceHigh, borderRadius: 20, padding: 22, width: '100%' },
  modalTitle: { fontSize: 19, fontWeight: '800', color: DS.textPrimary, marginBottom: 16 },
  modalInput: { backgroundColor: DS.surfaceLow, borderRadius: 10, padding: 13, marginBottom: 12, fontSize: 15, color: DS.textPrimary },
  modalArea: { height: 70, textAlignVertical: 'top' },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  modalCancel: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, backgroundColor: DS.surfaceHighest },
  modalCancelTxt: { color: DS.textMuted, fontWeight: '700', fontSize: 14 },
  modalConfirm: { paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10, backgroundColor: DS.lime, minWidth: 76, alignItems: 'center' },
  modalConfirmTxt: { color: DS.bg, fontWeight: '800', fontSize: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: DS.surfaceLow, borderWidth: 1, borderColor: DS.faint },
  roleChipOn: { backgroundColor: DS.lime, borderColor: DS.lime },
  roleChipTxt: { fontSize: 12, fontWeight: '700', color: DS.textVariant },
  roleChipTxtOn: { color: DS.bg },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  toggleLbl: { fontSize: 15, fontWeight: '600', color: DS.textPrimary },
  manageActions: { borderTopWidth: 1, borderTopColor: DS.faint, marginTop: 14, paddingTop: 8 },
  manageAction: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  manageActionTxt: { fontSize: 15, fontWeight: '600', color: DS.textPrimary },
});

export default TeamProfileScreen;
