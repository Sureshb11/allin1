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
  ActivityIndicator, Modal, Dimensions,
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

  // Add-member + add-award inline forms
  const [newMember, setNewMember] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [awardModal, setAwardModal] = useState(false);
  const [award, setAward] = useState({ title: '', year: '', note: '' });

  const team = data?.team;
  const isAdmin = !!team && (!team.ownerId || team.ownerId === me?.id);
  // Sport-aware: the tab icons, "Matches" glyph and honour stats all follow the
  // team's sport (cricket keeps runs/wickets; every other sport shows points).
  const sport = team?.sport || 'cricket';
  const isCricket = sport === 'cricket';
  const sportIcon = sportMeta(sport).icon;
  const tabs = [
    ['squad', 'Squad', 'account-group'],
    ['matches', 'Matches', sportIcon],
    ['standings', 'Standings', 'trophy-variant'],
    ['honours', 'Honours', 'medal'],
    ['gallery', 'Gallery', 'image-multiple'],
  ];

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: true, headerBackVisible: true, headerTitle: 'Team Profile' });
  }, [navigation]);

  const load = useCallback(async () => {
    const res = await legendsApi.getTeamProfile(teamId);
    if (res.success) setData(res.data);
    else showToast(res.error || 'Could not load team', 'error');
    setLoading(false);
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

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

  const addMember = async () => {
    const name = newMember.trim().replace(/\s+/g, ' ');
    if (name.length < 2) return showToast('Enter the member’s name.', 'error');
    setAddingMember(true);
    const res = await legendsApi.createPlayer({ name, role: 'Player', teamId, sport: team?.sport });
    setAddingMember(false);
    if (res.success) { setNewMember(''); await load(); showToast(`${name} added.`, 'success'); }
    else showToast(res.error || 'Failed to add member', 'error');
  };

  const removeMember = async (player) => {
    const res = await legendsApi.deletePlayer(player.id);
    if (res.success) { await load(); showToast(`${player.name} removed.`, 'success'); }
    else showToast(res.error || 'Failed to remove', 'error');
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
          </Text>
        </View>

        {isAdmin && (
          <TouchableOpacity style={styles.editProfileBtn} onPress={() => navigation.navigate('EditTeamProfile', { teamId })}>
            <Icon name="pencil" size={14} color={DS.lime} />
            <Text style={styles.editProfileTxt}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {team.bio ? <Text style={styles.bio}>{team.bio}</Text> : null}

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
            newMember={newMember} setNewMember={setNewMember} addMember={addMember}
            addingMember={addingMember} removeMember={removeMember} />
        )}
        {tab === 'matches' && (
          <MatchesTab matches={data.recentMatches || []} teamId={teamId} navigation={navigation} styles={styles} DS={DS} />
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

const SquadTab = ({ members, isAdmin, styles, DS, newMember, setNewMember, addMember, addingMember, removeMember }) => (
  <View>
    {isAdmin && (
      <View style={styles.addRow}>
        <TextInput style={styles.addInput} placeholder="Add member by name"
          placeholderTextColor={DS.textMuted} value={newMember} onChangeText={setNewMember}
          autoCapitalize="words" returnKeyType="done" onSubmitEditing={addMember} />
        <TouchableOpacity style={styles.addBtn} onPress={addMember} disabled={addingMember}>
          {addingMember ? <ActivityIndicator size="small" color={DS.bg} /> : <Icon name="plus" size={20} color={DS.bg} />}
        </TouchableOpacity>
      </View>
    )}
    {members.length === 0 && <Text style={styles.emptyTxt}>No members yet.</Text>}
    {members.map((m) => (
      <View key={m.id} style={styles.memberRow}>
        <View style={styles.memberAvatar}><Text style={styles.memberInitial}>{initials(m.name)}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.memberName}>{m.name}</Text>
          <Text style={styles.memberRole}>{m.role || 'Player'}</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity onPress={() => removeMember(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close-circle-outline" size={22} color={DS.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    ))}
  </View>
);

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
        {photos.map((p) => (
          <View key={p.id} style={{ width: size, height: size, marginBottom: GALLERY_GAP }}>
            <Image source={{ uri: p.url }} style={styles.galleryImg} />
            {isAdmin && (
              <TouchableOpacity style={styles.galleryDel} onPress={() => onRemove(p)}>
                <Icon name="close" size={13} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
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
  editProfileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6,
    borderWidth: 1, borderColor: DS.lime, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  editProfileTxt: { color: DS.lime, fontSize: 12, fontWeight: '800' },
  bio: { color: DS.textVariant, fontSize: 14, lineHeight: 20, paddingHorizontal: 16, marginTop: 12 },

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
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
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
  memberName: { color: DS.textPrimary, fontSize: 15, fontWeight: '600' },
  memberRole: { color: DS.textMuted, fontSize: 12, marginTop: 2 },

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

  // Modal
  modalOverlay: { flex: 1, backgroundColor: DS.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: DS.surfaceHigh, borderRadius: 20, padding: 22, width: '100%' },
  modalTitle: { fontSize: 19, fontWeight: '800', color: DS.textPrimary, marginBottom: 16 },
  modalInput: { backgroundColor: DS.surfaceLow, borderRadius: 10, padding: 13, marginBottom: 12, fontSize: 15, color: DS.textPrimary },
  modalArea: { height: 70, textAlignVertical: 'top' },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  modalCancel: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, backgroundColor: DS.surfaceHighest },
  modalCancelTxt: { color: DS.textMuted, fontWeight: '700', fontSize: 14 },
  modalConfirm: { paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10, backgroundColor: DS.lime },
  modalConfirmTxt: { color: DS.bg, fontWeight: '800', fontSize: 14 },
});

export default TeamProfileScreen;
