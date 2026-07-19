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
import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, TextInput, TouchableOpacity,
  ActivityIndicator, Modal, Dimensions, Alert, Switch,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
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

const TeamProfileScreen = ({ navigation, route }) => {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();
  const me = useCurrentUser();
  const { teamId } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);          // logo/cover upload in flight
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('squad');

  // Add-member (by mobile number) + add-award inline forms
  const [addingMember, setAddingMember] = useState(false);
  // Link an existing app user by their registered mobile number
  const [searchPhone, setSearchPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState(null);
  const [awardModal, setAwardModal] = useState(false);
  const [award, setAward] = useState({ title: '', year: '', note: '' });
  // Follow + insights + join state
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [insights, setInsights] = useState(null);
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
  // Sport-aware: the tab icons, "Matches" glyph and honour stats all follow the
  // team's sport (cricket keeps runs/wickets; every other sport shows points).
  const sport = team?.sport || 'cricket';
  const isCricket = sport === 'cricket';
  const sportIcon = sportMeta(sport).icon;
  const tabs = [
    ['squad', 'Squad', 'account-group'],
    ['matches', 'Matches', sportIcon],
    ['form', 'Form', 'chart-line'],
    ['standings', 'Standings', 'trophy-variant'],
    ['honours', 'Honours', 'medal'],
    ['gallery', 'Gallery', 'image-multiple'],
  ];
  const joinStatus = data?.viewerJoinStatus || 'none';
  const isOwner = joinStatus === 'owner';
  const isOutsider = joinStatus !== 'member' && joinStatus !== 'owner' && !isAdmin;
  // Team chat is for people ON the team — owner, admin, or a plain linked member.
  const canChat = isOwner || isAdmin || joinStatus === 'member';

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: true, headerBackVisible: true, headerTitle: 'Team Profile' });
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

  // Lazy-load form + top performers the first time the Form tab is opened.
  useEffect(() => {
    if (tab === 'form' && !insights && teamId) {
      legendsApi.getTeamInsights(teamId).then((r) => { if (r.success) setInsights(r.data); });
    }
  }, [tab, insights, teamId]);

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
    return <View style={[styles.container, styles.center]}><ActivityIndicator size="large" color={DS.lime} /></View>;
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
            {[team.city, team.homeGround].filter(Boolean).join(' · ') || (team.sport || 'cricket')}
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow} contentContainerStyle={styles.tabRowInner}>
        {tabs.map(([key, label, icon]) => (
          <TouchableOpacity key={key} onPress={() => setTab(key)} style={[styles.tabChip, tab === key && styles.tabChipActive]}>
            <Icon name={icon} size={15} color={tab === key ? DS.bg : DS.textMuted} />
            <Text style={[styles.tabChipTxt, tab === key && styles.tabChipTxtActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Tab content ── */}
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
        {tab === 'form' && (
          <FormTab insights={insights} isCricket={isCricket} styles={styles} DS={DS} />
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
            {isCricket && (
              <View style={styles.chipWrap}>
                {['Batter', 'Bowler', 'All-rounder', 'Keeper'].map((r) => (
                  <TouchableOpacity key={r} onPress={() => setManageForm((f) => ({ ...f, role: r }))}
                    style={[styles.roleChip, manageForm.role === r && styles.roleChipOn]}>
                    <Text style={[styles.roleChipTxt, manageForm.role === r && styles.roleChipTxtOn]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TextInput style={styles.modalInput} placeholder="Role" placeholderTextColor={DS.textMuted}
              value={manageForm.role} onChangeText={(t) => setManageForm((f) => ({ ...f, role: t }))} />

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
            <Text style={styles.memberInitial}>{initials(m.name)}</Text>
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

const FormTab =({ insights, isCricket, styles, DS }) => {
  if (!insights) return <ActivityIndicator color={DS.lime} style={{ marginTop: 24 }} />;
  const form = insights.form || [];
  const batters = insights.topBatters || [];
  const bowlers = insights.topBowlers || [];
  return (
    <View>
      <Text style={styles.blockLabel}>Recent Form</Text>
      {form.length === 0 ? <Text style={styles.emptyTxt}>No completed matches yet.</Text> : (
        <View style={styles.formRow}>
          {form.map((f, i) => (
            <View key={i} style={[styles.formPill, { backgroundColor: f.result === 'W' ? DS.success : DS.danger }]}>
              <Text style={styles.formPillTxt}>{f.result}</Text>
            </View>
          ))}
        </View>
      )}
      {isCricket ? (
        <>
          {batters.length > 0 && (
            <>
              <Text style={[styles.blockLabel, { marginTop: 22 }]}>Top Batters</Text>
              {batters.map((b, i) => (
                <View key={i} style={styles.perfRow}>
                  <Text style={styles.perfName} numberOfLines={1}>{b.player?.name || 'Player'}</Text>
                  <Text style={styles.perfVal}>{b.runs} runs</Text>
                </View>
              ))}
            </>
          )}
          {bowlers.length > 0 && (
            <>
              <Text style={[styles.blockLabel, { marginTop: 22 }]}>Top Bowlers</Text>
              {bowlers.map((b, i) => (
                <View key={i} style={styles.perfRow}>
                  <Text style={styles.perfName} numberOfLines={1}>{b.player?.name || 'Player'}</Text>
                  <Text style={styles.perfVal}>{b.wickets} wkts</Text>
                </View>
              ))}
            </>
          )}
        </>
      ) : (
        <Text style={[styles.emptyTxt, { marginTop: 16 }]}>Player leaderboards are available for cricket.</Text>
      )}
    </View>
  );
};

const MatchesTab = ({ matches, teamId, navigation, styles, DS }) => {
  if (matches.length === 0) return <Text style={styles.emptyTxt}>No matches yet.</Text>;
  return (
    <View>
      {matches.map((m) => {
        const opp = m.team1Id === teamId ? m.team2 : m.team1;
        const live = m.status === 'live';
        const done = m.status === 'completed';
        return (
          <TouchableOpacity key={m.id} style={styles.matchRow}
            onPress={() => navigation.navigate('MatchInsights', { matchId: m.id })}>
            <View style={styles.matchIcon}>
              <Icon name={live ? 'access-point' : done ? 'check' : 'clock-outline'}
                size={16} color={live ? DS.live : done ? DS.success : DS.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.matchOpp} numberOfLines={1}>vs {opp?.name || 'TBD'}</Text>
              <Text style={styles.matchMeta} numberOfLines={1}>
                {m.result || (live ? 'Live now' : m.status === 'scheduled' ? 'Scheduled' : m.venue || '')}
              </Text>
            </View>
            {(m.score1 || m.score2) ? (
              <Text style={styles.matchScore}>{m.score1 || '–'} / {m.score2 || '–'}</Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const StandingsTab = ({ rows, styles, DS }) => {
  if (rows.length === 0) return <Text style={styles.emptyTxt}>No standings yet.</Text>;
  return (
    <View>
      <View style={[styles.tableRow, styles.tableHead]}>
        <Text style={[styles.thRank]}>#</Text>
        <Text style={[styles.thTeam]}>Team</Text>
        <Text style={styles.thNum}>P</Text>
        <Text style={styles.thNum}>W</Text>
        <Text style={styles.thNum}>Win%</Text>
      </View>
      {rows.map((r) => (
        <View key={r.id} style={[styles.tableRow, r.isCurrent && styles.tableRowActive]}>
          <Text style={styles.tdRank}>{r.rank}</Text>
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
  ctaTxt: { fontSize: 13.5, fontWeight: '800', color: DS.lime },

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
  tabRowInner: { paddingHorizontal: 16, gap: 8 },
  tabChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, backgroundColor: DS.surfaceHigh,
  },
  tabChipActive: { backgroundColor: DS.lime },
  tabChipTxt: { fontSize: 13, fontWeight: '700', color: DS.textMuted },
  tabChipTxtActive: { color: DS.bg },

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
  },
  memberInitial: { color: '#fff', fontWeight: '800', fontSize: 14 },
  jerseyBadge: {
    position: 'absolute', bottom: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 3,
    backgroundColor: DS.surfaceHighest, borderWidth: 1.5, borderColor: DS.bg, alignItems: 'center', justifyContent: 'center',
  },
  jerseyTxt: { fontSize: 9.5, fontWeight: '900', color: DS.textPrimary },
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
  perfName: { color: DS.textPrimary, fontSize: 14.5, fontWeight: '600', flex: 1, marginRight: 12 },
  perfVal: { color: DS.lime, fontSize: 14, fontWeight: '800' },

  // Standings
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: DS.faint },
  tableHead: { borderBottomWidth: 1.5, borderBottomColor: DS.surfaceHighest },
  tableRowActive: { backgroundColor: DS.surfaceHigh, borderRadius: 8 },
  thRank: { width: 26, fontSize: 11, fontWeight: '800', color: DS.textMuted },
  thTeam: { flex: 1, fontSize: 11, fontWeight: '800', color: DS.textMuted },
  thNum: { width: 46, textAlign: 'center', fontSize: 11, fontWeight: '800', color: DS.textMuted },
  tdRank: { width: 26, fontSize: 14, fontWeight: '800', color: DS.textPrimary },
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
  awardNote: { color: DS.textMuted, fontSize: 12.5, marginTop: 2 },

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
  roleChipTxt: { fontSize: 12.5, fontWeight: '700', color: DS.textVariant },
  roleChipTxtOn: { color: DS.bg },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  toggleLbl: { fontSize: 15, fontWeight: '600', color: DS.textPrimary },
  manageActions: { borderTopWidth: 1, borderTopColor: DS.faint, marginTop: 14, paddingTop: 8 },
  manageAction: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  manageActionTxt: { fontSize: 15, fontWeight: '600', color: DS.textPrimary },
});

export default TeamProfileScreen;
