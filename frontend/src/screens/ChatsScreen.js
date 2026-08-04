import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { useCurrentUser } from '../utils/currentUser';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import PlayerAvatar from '../components/PlayerAvatar';
import { useDockLock } from '../components/AutoHideTabBar';

// Rooms are grouped by where the conversation came from. ChatRoom.type carries
// it: 'scout' for a Scout connection, 'team' for a squad room, 'tournament' for
// a tournament entry. Anything else falls into Direct.
//
// Scout and tournament rooms BOTH used to save as 'direct', so they were
// indistinguishable — that's fixed at the two creation sites, but rooms created
// before the fix keep the old value and land in Direct.
const GROUPS = [
  { key: 'scout', label: 'Scout', icon: 'telescope' },
  { key: 'team', label: 'Teams', icon: 'account-group-outline' },
  { key: 'tournament', label: 'Tournaments', icon: 'trophy-outline' },
  { key: 'direct', label: 'Direct', icon: 'message-outline' },
];

const timeAgo = (iso) => {
  if (!iso) return '';
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 90) return 'now';
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  const days = Math.floor(secs / 86400);
  if (days < 7) return `${days}d`;
  if (days < 35) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
};

export default function ChatsScreen({ navigation }) {
  // The dock stands down here: the chat list is its own screen with its own tabs,
  // opened from the header rather than from the dock.
  // Released on blur, so leaving brings it straight back.
  const lockDock = useDockLock();
  useFocusEffect(useCallback(() => {
    lockDock(true);
    return () => lockDock(false);
  }, [lockDock]));

  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const me = useCurrentUser();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await legendsApi.getChatRooms();
    if (res.success) setRooms(res.data);
  }, []);

  // Reload on focus, not just on mount — coming back from a thread should clear
  // that room's unread badge rather than leave a stale count on screen.
  useFocusEffect(useCallback(() => {
    let alive = true;
    setLoading(true);
    load().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // One flat list with section headers, so the whole thing scrolls as a unit and
  // FlatList still virtualises. Empty groups contribute nothing.
  const data = [];
  GROUPS.forEach((g) => {
    const inGroup = g.key === 'direct'
      ? rooms.filter((r) => !GROUPS.some((x) => x.key !== 'direct' && x.key === r.type))
      : rooms.filter((r) => r.type === g.key);
    if (!inGroup.length) return;
    const unread = inGroup.reduce((n, r) => n + (r.unreadCount || 0), 0);
    data.push({ kind: 'header', id: `h-${g.key}`, label: g.label, icon: g.icon, count: inGroup.length, unread });
    inGroup.forEach((r) => data.push({ kind: 'room', id: r.id, room: r }));
  });

  // Who you're talking to. A two-person room reads better as the other person's
  // name than as the room's own title.
  const counterpart = (room) => {
    const others = (room.members || []).filter((m) => m.userId !== me?.id);
    return others.length === 1 ? others[0].user : null;
  };

  const renderItem = ({ item }) => {
    if (item.kind === 'header') {
      return (
        <View style={styles.groupHead}>
          <Icon name={item.icon} size={14} color={DS.textMuted} />
          <Text style={styles.groupLabel}>{item.label}</Text>
          <Text style={styles.groupCount}>{item.count}</Text>
          {item.unread > 0 && <View style={styles.groupDot} />}
        </View>
      );
    }

    const r = item.room;
    const other = counterpart(r);
    const name = other ? `${other.firstName} ${other.lastName || ''}`.trim() : r.name;
    const unread = r.unreadCount || 0;
    const preview = r.lastMessage
      ? `${r.lastMessage.senderId === me?.id ? 'You: ' : ''}${r.lastMessage.text}`
      : 'No messages yet';

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('Chat', { chatId: r.id, chatName: name, chatType: r.type })}>
        <PlayerAvatar name={name || '?'} avatarUrl={other?.avatarUrl} size={44} />
        <View style={styles.rowMain}>
          <View style={styles.rowTop}>
            <Text style={[styles.rowName, unread > 0 && styles.rowNameUnread]} numberOfLines={1}>{name}</Text>
            <Text style={styles.rowTime}>{timeAgo(r.lastActivityAt)}</Text>
          </View>
          {/* A Scout room is named after the listing, so when the row already
              shows the person, the room name is the context line. */}
          {other && r.name && r.name !== name
            ? <Text style={styles.rowContext} numberOfLines={1}>{r.name}</Text>
            : null}
          <Text style={[styles.rowPreview, unread > 0 && styles.rowPreviewUnread]} numberOfLines={1}>{preview}</Text>
        </View>
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const totalUnread = rooms.reduce((n, r) => n + (r.unreadCount || 0), 0);

  const header = (
    // Drawn here, not by the navigator: this stack sets headerShown:false
    // everywhere else and each screen supplies its own, so the default header
    // would have been a light system bar sitting in a dark app.
    <View style={styles.hero}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
        <Icon name="arrow-left" size={22} color={DS.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.heroTitle}>Chats</Text>
      {totalUnread > 0 && (
        <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>{totalUnread}</Text></View>
      )}
    </View>
  );

  if (loading && !rooms.length) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.center}><ActivityIndicator color={DS.lime} /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
    {header}
    <FlatList
      style={styles.container}
      data={data}
      keyExtractor={(i) => i.id}
      renderItem={renderItem}
      contentContainerStyle={[styles.list, { paddingBottom: 16 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Icon name="message-outline" size={44} color={DS.surfaceHighest} />
          <Text style={styles.emptyText}>No chats yet</Text>
          <Text style={styles.emptySub}>Connect with someone on Scout, or join a team.</Text>
        </View>
      }
    />
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  // Matches the other in-stack screens' own headers (see ChatScreen's hero).
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: DS.surfaceHigh,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { flex: 1, fontSize: 17, fontWeight: '900', color: DS.textPrimary, letterSpacing: 0.3 },
  heroBadge: {
    minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7,
    backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center',
  },
  heroBadgeText: { fontSize: 12, fontWeight: '900', color: DS.onLime },
  center: { flex: 1, backgroundColor: DS.bg, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 14, paddingTop: 8 },

  groupHead: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingTop: 18, paddingBottom: 8,
  },
  groupLabel: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.9, textTransform: 'uppercase' },
  groupCount: { flex: 1, fontSize: 11, fontWeight: '800', color: DS.textMuted },
  groupDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: DS.lime },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { flex: 1, fontSize: 15, fontWeight: '600', color: DS.textPrimary },
  rowNameUnread: { fontWeight: '800' },
  rowTime: { fontSize: 11, fontWeight: '700', color: DS.textMuted },
  rowContext: { fontSize: 11, color: DS.textMuted, fontWeight: '600' },
  rowPreview: { fontSize: 13, color: DS.textVariant },
  rowPreviewUnread: { color: DS.textPrimary, fontWeight: '600' },

  badge: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '900', color: DS.onLime },

  empty: { alignItems: 'center', paddingTop: 90, paddingHorizontal: 32 },
  emptyText: { fontSize: 16, fontWeight: '700', color: DS.textVariant, marginTop: 12 },
  emptySub: { fontSize: 13, color: DS.textMuted, marginTop: 4, textAlign: 'center' },
});
