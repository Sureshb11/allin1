import { useTheme, useThemedStyles } from "../theme/ThemeContext";import { useState, useEffect, useLayoutEffect, useCallback} from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, StatusBar,
  ActivityIndicator } from
'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDockLock } from '../components/AutoHideTabBar';
import legendsApi from '../services/LegendsApi';
// The header's bell badge reads the same number this screen does — kept in
// step here rather than left to expire on the next focus, so walking back out
// of a read notification does not leave a stale count behind you.
import { setUnreadCount, bumpUnreadCount } from '../utils/unreadCount';








const NotificationScreen = ({ navigation }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  // The dock stands down here: a full-screen list you open, read and leave — there
  // is nothing to navigate sideways to from it.
  // Released on blur, so leaving brings it straight back.
  const lockDock = useDockLock();
  useFocusEffect(useCallback(() => {
    lockDock(true);
    return () => lockDock(false);
  }, [lockDock]));

  const [notifications, setNotifications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Notifications',
    });
  }, [navigation]);

  // True unread count from the server — the loaded page alone would
  // undercount once there are more unread than fit in one page.
  const [serverUnread, setServerUnread] = useState(0);
  // The server has always paged this route — it returns a nextCursor and caps
  // `limit` server-side — and the client only ever asked for the first page. A
  // notification older than the most recent 30 was simply unreachable.
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {loadNotifications();}, []);

  const loadNotifications = async () => {
    try {
      const response = await legendsApi.getNotifications();
      if (response.success) {
        setNotifications(response.data);
        setCursor(response.nextCursor);
        setServerUnread(response.unread ?? 0);
        setUnreadCount(response.unread ?? 0);
      }
    } catch (error) {Alert.alert('Error', 'Failed to load notifications');} finally
    {setRefreshing(false);}
  };

  // One page at a time as you reach the end. Guarded on `loadingMore` because
  // onEndReached fires repeatedly during a fast scroll, and on `cursor` being
  // null, which is how the server says there is nothing after this.
  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await legendsApi.getNotifications({ cursor });
      if (response.success) {
        // Appended by id rather than blindly concatenated: a notification
        // arriving between two page fetches shifts the window, and the same row
        // can come back on both pages — which React answers with a duplicate-key
        // warning and a row rendered twice.
        setNotifications((prev) => {
          const seen = new Set(prev.map((n) => n.id));
          return [...prev, ...response.data.filter((n) => !seen.has(n.id))];
        });
        setCursor(response.nextCursor);
      }
    } finally { setLoadingMore(false); }
  };

  const handleRefresh = () => {setRefreshing(true);setCursor(null);loadNotifications();};

  const markAsRead = async (notificationId) => {
    try {
      const response = await legendsApi.markNotificationAsRead(notificationId);
      if (response.success) {
        setNotifications(notifications.map((notif) =>
        notif.id === notificationId ? { ...notif, read: true } : notif
        ));
        // keep the server-derived badge in step with what the user just read
        if (!notifications.find((n) => n.id === notificationId)?.read) {
          setServerUnread((c) => Math.max(0, c - 1));
          bumpUnreadCount(-1);
        }
      }
    } catch (error) {console.log('Error marking notification as read:', error);}
  };

  const markAllAsRead = async () => {
    try {
      const response = await legendsApi.markAllNotificationsAsRead();
      if (response.success) {
        setNotifications(notifications.map((notif) => ({ ...notif, read: true })));
        setServerUnread(0);
        setUnreadCount(0);
        Alert.alert('Success', 'All notifications marked as read');
      }
    } catch (error) {Alert.alert('Error', 'Failed to mark notifications as read');}
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'match':return { icon: 'cricket', bg: DS.lime };
      case 'reminder':return { icon: 'timer-outline', bg: DS.warning };
      case 'achievement':return { icon: 'trophy', bg: '#d97706' };
      case 'tournament':return { icon: 'trophy-variant', bg: DS.lime };
      case 'social':return { icon: 'account-group', bg: DS.success };
      case 'system':return { icon: 'cog-outline', bg: DS.textMuted };
      case 'like':return { icon: 'heart', bg: DS.live };
      case 'comment':return { icon: 'comment-text-outline', bg: DS.blue };
      case 'follow':return { icon: 'account-plus', bg: DS.lime };
      case 'chat':return { icon: 'message-text', bg: DS.blue };
      default:return { icon: 'bell-outline', bg: DS.blue };
    }
  };

  const renderNotificationItem = ({ item }) => {
    const { icon, bg } = getNotificationIcon(item.type);
    return (
      <TouchableOpacity
        style={[styles.notificationCard, !item.read && styles.unreadNotification]}
        onPress={() => {
          if (!item.read) markAsRead(item.id);
          // Deep-link on whatever id the payload carries. A notification that
          // goes nowhere when tapped is worse than none — it looks broken.
          if (item.data?.tournamentId) navigation.navigate('TournamentDetail', { tournamentId: item.data.tournamentId });
          else if (item.data?.matchId) navigation.navigate('Scorecard', { matchId: item.data.matchId });
          // A new follower opens the person who followed you. Unclaimed rows
          // carry no playerId, so the tap stays put rather than opening a
          // profile screen with nothing behind it.
          else if (item.type === 'follow' && item.data?.playerId) navigation.navigate('PlayerProfile', { playerId: item.data.playerId });
          else if (item.data?.listingId) navigation.navigate('LookingFor');
          // Kept in step with utils/notificationRoute deliberately: when the two
          // disagreed, one notification opened two different screens depending
          // on whether you tapped it in the app or in the system tray.
          else if (item.data?.chatId) navigation.navigate('Chat', { chatId: item.data.chatId, chatName: item.data.chatName || 'Chat' });
          else if (item.data?.teamId) navigation.navigate('TeamProfile', { teamId: item.data.teamId });
          else if (item.type === 'achievement') navigation.navigate('BadgeDetail');
        }}>
        <View style={styles.notificationContent}>
          <View style={styles.notificationHeader}>
            <View style={[styles.iconContainer, { backgroundColor: bg + '22' }]}>
              <Icon name={icon} size={20} color={bg} />
            </View>
            <View style={styles.notificationInfo}>
              <Text style={[styles.notificationTitle, !item.read && styles.unreadTitle]}>
                {item.title}
              </Text>
              <Text style={styles.notificationTime}>{item.time}</Text>
            </View>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.notificationMessage} numberOfLines={2}>{item.message}</Text>
          <View style={styles.notificationActions}>
            <Text style={styles.notificationType}>{item.type}</Text>
            {!item.read &&
            <TouchableOpacity style={styles.markReadButton}
            onPress={(e) => {e.stopPropagation();markAsRead(item.id);}}>
                <Text style={styles.markReadText}>Mark as read</Text>
              </TouchableOpacity>
            }
          </View>
        </View>
      </TouchableOpacity>);

  };

  const unreadCount = Math.max(serverUnread, notifications.filter((n) => !n.read).length);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />
      <View style={styles.header}>
        <Icon name="bell-outline" size={20} color={DS.textMuted} />
        <Text style={styles.headerTitle}>
          Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}
        </Text>
        {unreadCount > 0 &&
        <TouchableOpacity style={styles.markAllButton} onPress={markAllAsRead}>
            <Text style={styles.markAllButtonText}>Mark all read</Text>
          </TouchableOpacity>
        }
      </View>

      <FlatList
        data={notifications}
        renderItem={renderNotificationItem}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={DS.lime} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={DS.lime} style={{ marginVertical: 18 }} /> : null}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
        <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Icon name="bell-off-outline" size={56} color={DS.textMuted} />
            </View>
            <Text style={styles.emptyText}>No notifications</Text>
            <Text style={styles.emptySubtext}>You're all caught up!</Text>
          </View>
        } />
      
    </View>);

};

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  markAllButton: {
    backgroundColor: DS.surfaceHigh, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999
  },
  markAllButtonText: { fontSize: 12, fontWeight: '700', color: DS.lime },
  listContent: { paddingVertical: 10 },
  notificationCard: {
    backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16,
    marginHorizontal: 16, marginBottom: 10
  },
  unreadNotification: { backgroundColor: DS.lime + '0F' },
  notificationContent: { flex: 1 },
  notificationHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  iconContainer: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  notificationInfo: { flex: 1 },
  notificationTitle: { fontSize: 14, color: DS.textPrimary, marginBottom: 2 },
  unreadTitle: { fontWeight: '700', color: DS.textPrimary },
  notificationTime: { fontSize: 12, color: DS.textMuted },
  unreadDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: DS.lime, marginTop: 4 },
  notificationMessage: { fontSize: 13, color: DS.textVariant, lineHeight: 20, marginBottom: 12 },
  notificationActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notificationType: { fontSize: 10, color: DS.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  markReadButton: { backgroundColor: DS.surfaceHighest, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  markReadText: { fontSize: 12, fontWeight: '500', color: DS.textVariant },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyIconContainer: { marginBottom: 16 },
  emptyText: { fontSize: 16, fontWeight: '700', color: DS.textVariant, marginBottom: 6 },
  emptySubtext: { fontSize: 14, color: DS.textMuted }
});

export default NotificationScreen;