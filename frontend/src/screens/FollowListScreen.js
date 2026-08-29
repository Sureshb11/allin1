// FollowListScreen — who follows a player, and what that player follows.
//
// One screen with two tabs rather than two screens, because the two lists are
// the same question asked in opposite directions and you switch between them
// constantly. The tab row is the shared L2 `segment` from theme/controls: this
// is a view-mode toggle over one set of data, which is exactly what a segment
// is for, and it keeps the app to one control per idea.
//
// The two directions do NOT hold the same thing. A follower is an ACCOUNT — a
// person, who may or may not have a player row behind them. What you follow is
// PLAYERS and TEAMS. The backend keeps them as two routes for that reason and
// this screen keeps them as two lists, sectioned; flattening them into one
// stream would need a shape that fits neither.
import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity,
  Image, StatusBar, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { makeControls } from '../theme/controls';
import { roleLabel } from '../utils/squadOrder';
import { showToast } from '../components/Toast';
import { useCurrentUser } from '../utils/currentUser';

const initialsOf = (name) =>
  (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function Avatar({ uri, name, styles, square }) {
  if (uri) return <Image source={{ uri }} style={[styles.avatar, square && styles.avatarSquare]} />;
  return (
    <View style={[styles.avatar, square && styles.avatarSquare, styles.avatarFallback]}>
      <Text style={styles.avatarTxt}>{initialsOf(name)}</Text>
    </View>
  );
}

export default function FollowListScreen({ route, navigation }) {
  const { playerId, name: subjectName, initialTab } = route.params || {};
  const { colors: DS, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const C = useThemedStyles(makeControls);
  const meUser = useCurrentUser();

  const [tab, setTab] = useState(initialTab === 'following' ? 'following' : 'followers');
  const [followers, setFollowers] = useState(null);   // null = not loaded yet
  const [following, setFollowing] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    // Both at once. Each is one short list, and fetching the other tab only on
    // tap makes the counts on the segment appear late — which is the moment the
    // row is least useful, since the count is why you would switch.
    const [f, g] = await Promise.all([
      legendsApi.getPlayerFollowers(playerId),
      legendsApi.getPlayerFollowing(playerId),
    ]);
    if (f.success) setFollowers(f.data);
    if (g.success) setFollowing(g.data);
  }, [playerId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Follow / unfollow straight from a follower row, so following someone back
  // does not need a trip through their profile.
  const toggleFollow = useCallback(async (row) => {
    if (!row.playerId || busyId) return;
    setBusyId(row.playerId);
    const next = !row.following;
    setFollowers((prev) => prev && {
      ...prev,
      followers: prev.followers.map((r) => (r.playerId === row.playerId ? { ...r, following: next } : r)),
    });
    const res = await legendsApi.toggleFollowPlayer(row.playerId);
    if (res.success) {
      showToast(res.following ? `Following ${row.name}` : `Unfollowed ${row.name}`, 'success');
      // The Following tab now disagrees with the server, and it is one cheap
      // request away from agreeing again.
      legendsApi.getPlayerFollowing(playerId).then((g) => { if (g.success) setFollowing(g.data); });
    } else {
      setFollowers((prev) => prev && {
        ...prev,
        followers: prev.followers.map((r) => (r.playerId === row.playerId ? { ...r, following: !next } : r)),
      });
      showToast('Could not update follow', 'error');
    }
    setBusyId(null);
  }, [busyId, playerId]);

  const openPlayer = (id, nm) => id && navigation.navigate('PlayerProfile', { playerId: id, player: { id, name: nm } });
  const openTeam = (id) => id && navigation.navigate('TeamProfile', { teamId: id });

  const loading = followers === null && following === null;

  const followerRow = ({ item }) => {
    // Your own row never offers a Follow button — you cannot follow yourself —
    // and an account with no player row behind it has nothing to follow yet.
    const isMe = !!meUser?.id && item.userId === meUser.id;
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={item.playerId ? 0.8 : 1}
        disabled={!item.playerId}
        onPress={() => openPlayer(item.playerId, item.name)}>
        <Avatar uri={item.avatarUrl} name={item.name} styles={styles} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
          {!item.playerId && <Text style={styles.rowSub} numberOfLines={1}>No player profile yet</Text>}
        </View>
        {!!item.playerId && !isMe && (
          <TouchableOpacity
            style={[styles.followBtn, item.following && styles.followBtnOn]}
            onPress={() => toggleFollow(item)}
            disabled={busyId === item.playerId}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: item.following }}>
            {busyId === item.playerId
              ? <ActivityIndicator size="small" color={item.following ? DS.bg : DS.lime} />
              : <Text style={[styles.followTxt, item.following && styles.followTxtOn]}>
                  {item.following ? 'Following' : 'Follow'}
                </Text>}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const followingRow = ({ item }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.8}
      onPress={() => (item.kind === 'team' ? openTeam(item.id) : openPlayer(item.id, item.name))}>
      <Avatar uri={item.avatarUrl || item.logoUrl} name={item.name} styles={styles} square={item.kind === 'team'} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        {!!item.sub && <Text style={styles.rowSub} numberOfLines={1}>{item.sub}</Text>}
      </View>
      <Icon name="chevron-right" size={20} color={DS.textMuted} />
    </TouchableOpacity>
  );

  // Players and teams in one list, each behind its own header, so the sections
  // stay legible without two scroll views fighting each other.
  const followingRows = [
    ...((following?.players || []).map((p) => ({
      ...p, kind: 'player',
      sub: [roleLabel(p.role, p.sport), p.team].filter(Boolean).join(' · '),
    }))),
    ...((following?.teams || []).map((t) => ({ ...t, kind: 'team', sub: 'Team' }))),
  ];

  const empty = (icon, title, sub) => (
    <View style={styles.empty}>
      <Icon name={icon} size={44} color={DS.textMuted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{sub}</Text>
    </View>
  );

  const isFollowers = tab === 'followers';

  return (
    <View style={styles.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{subjectName || 'Player'}</Text>
          <Text style={styles.subtitle}>Followers and following</Text>
        </View>
      </View>

      <View style={styles.segWrap}>
        <View style={C.segment}>
          {[
            ['followers', 'Followers', followers?.count],
            ['following', 'Following', following?.count],
          ].map(([key, label, count]) => {
            const on = tab === key;
            return (
              <TouchableOpacity key={key} style={[C.segBtn, on && C.segBtnOn]} onPress={() => setTab(key)}
                activeOpacity={0.85} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[C.segText, on && C.segTextOn]}>{label}</Text>
                {count != null && (
                  <View style={[C.segCount, on && C.segCountOn]}>
                    <Text style={[C.segCountText, on && C.segCountTextOn]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={DS.lime} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={isFollowers ? (followers?.followers || []) : followingRows}
          keyExtractor={(item) => (isFollowers ? item.userId : `${item.kind}-${item.id}`)}
          renderItem={isFollowers ? followerRow : followingRow}
          contentContainerStyle={styles.listPad}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}
          ListEmptyComponent={isFollowers
            ? empty('account-group-outline', 'No followers yet',
                `Nobody follows ${subjectName || 'this player'} yet. Following someone puts their matches in your circle.`)
            // An unclaimed player row — one added to a squad by somebody else,
            // never signed into — follows nothing, and that is a different fact
            // from an empty list.
            : following?.linked === false
              ? empty('account-question-outline', 'No account linked',
                  'This player has not been claimed by an account yet, so they do not follow anyone.')
              : empty('account-heart-outline', 'Not following anyone',
                  'Players and teams you follow show up here, and their matches appear in your circle.')}
        />
      )}
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16, backgroundColor: DS.surfaceLow,
  },
  back: { padding: 4 },
  title: { fontSize: 19, fontWeight: '800', color: DS.textPrimary },
  subtitle: { fontSize: 12, color: DS.textMuted, marginTop: 2 },

  segWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },

  listPad: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, flexGrow: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DS.surfaceHighest,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: DS.surfaceHighest },
  avatarSquare: { borderRadius: 10 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: DS.lime, fontWeight: '800', fontSize: 15 },
  rowName: { fontSize: 15, fontWeight: '700', color: DS.textPrimary },
  rowSub: { fontSize: 12, color: DS.textMuted, marginTop: 2 },

  followBtn: {
    minWidth: 92, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: DS.lime, backgroundColor: 'transparent',
  },
  followBtnOn: { backgroundColor: DS.lime },
  followTxt: { fontSize: 12.5, fontWeight: '800', color: DS.lime },
  followTxtOn: { color: DS.bg },

  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 64, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: DS.textPrimary, marginTop: 6 },
  emptySub: { fontSize: 13, color: DS.textMuted, textAlign: 'center', lineHeight: 19 },
});
