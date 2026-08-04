import { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, KeyboardAvoidingView, Platform, StatusBar } from
'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDockLock } from '../components/AutoHideTabBar';
import legendsApi from '../services/LegendsApi';
import { useCurrentUser } from '../utils/currentUser';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import PlayerAvatar from '../components/PlayerAvatar';

const POLL_MS = 3000;
// Two messages from the same person inside this window read as one turn in the
// conversation, so only the first carries an avatar and a name.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

const getTime = (msg) => {
  try { return new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
};

const getSenderName = (msg, mine) => {
  if (mine) return 'You';
  if (msg.sender) return `${msg.sender.firstName} ${msg.sender.lastName || ''}`.trim();
  return 'Member';
};

// Day heading for the separators — "Today"/"Yesterday" beat a date nobody parses.
const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yest)) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

// What kind of room this is, for the header subtitle. Was hardcoded "Team chat"
// on every conversation, including one-to-one Scout connections.
const KIND_LABEL = {
  scout: 'Scout connection',
  team: 'Team chat',
  tournament: 'Tournament chat',
  direct: 'Direct message',
};

function ChatBubble({ item, mine, showMeta, onRetry, styles, DS }) {
  const failed = item.status === 'failed';
  const pending = item.status === 'pending';
  return (
    <View style={[styles.bubbleWrap, mine && styles.bubbleWrapMine, !showMeta && styles.bubbleWrapTight]}>
      {/* The avatar column is held open even when grouped, so bubbles stay aligned. */}
      {!mine && (showMeta
        ? <PlayerAvatar name={getSenderName(item, false)} avatarUrl={item.sender?.avatarUrl} size={28} />
        : <View style={{ width: 28 }} />)}

      <View style={[
        styles.bubble,
        mine ? styles.bubbleMine : styles.bubbleOther,
        failed && styles.bubbleFailed,
        pending && styles.bubblePending,
      ]}>
        {!mine && showMeta && <Text style={styles.senderName}>{getSenderName(item, false)}</Text>}
        <Text style={[styles.msgText, mine && styles.msgTextMine]}>{item.text}</Text>
        <View style={styles.timeRow}>
          <Text style={[styles.msgTime, mine && styles.msgTimeMine]}>{getTime(item)}</Text>
          {/* A real status, not a permanent double-tick: clock while in flight,
              check once the server has it, warning if it never landed. */}
          {mine && !failed && (
            <Icon
              name={pending ? 'clock-outline' : 'check'}
              size={12}
              color={DS.onLime}
              style={{ marginLeft: 4, opacity: pending ? 0.5 : 0.75 }} />
          )}
        </View>
      </View>

      {failed && (
        <TouchableOpacity style={styles.retryBtn} onPress={() => onRetry(item)} hitSlop={8}>
          <Icon name="refresh" size={15} color={DS.coral} />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const ChatScreen = ({ route, navigation }) => {
  // The dock stands down here: a conversation is a full-screen thread with a composer at
  // the bottom, and the dock floated between the message you are writing and
  // the keyboard.
  // Released on blur, so leaving brings it straight back.
  const lockDock = useDockLock();
  useFocusEffect(useCallback(() => {
    lockDock(true);
    return () => lockDock(false);
  }, [lockDock]));

  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const me = useCurrentUser();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const { chatId, chatName = 'Chat', chatType } = route.params || {};
  const pollingRef = useRef(null);
  const lastTimestampRef = useRef(null);
  const listRef = useRef(null);
  // Mirrors atBottom for use inside callbacks that shouldn't re-subscribe.
  const atBottomRef = useRef(true);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const mapIn = useCallback((rows) => rows.map((m) => ({ ...m, status: 'sent' })), []);

  const loadMessages = useCallback(async () => {
    if (!chatId) return;
    const res = await legendsApi.getChatMessages(chatId);
    if (!res.success) return;
    const rows = mapIn(res.data);
    setMessages((prev) => {
      // A message that failed to send only exists on this device. Replacing the
      // list wholesale on every focus threw it away silently — you'd come back
      // from another screen and your unsent text was simply gone, with no error
      // and nothing to retry. Carry the un-delivered ones over.
      const undelivered = prev.filter((m) => m.status === 'failed' || m.status === 'pending');
      return undelivered.length ? [...rows, ...undelivered] : rows;
    });
    if (rows.length) lastTimestampRef.current = rows[rows.length - 1].createdAt;
  }, [chatId, mapIn]);

  const pollNewMessages = useCallback(async () => {
    if (!chatId) return;
    const res = await legendsApi.getChatMessages(chatId, lastTimestampRef.current);
    if (!res.success || !res.data.length) return;
    const rows = mapIn(res.data);
    setMessages((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const fresh = rows.filter((m) => !seen.has(m.id));
      if (!fresh.length) return prev;
      // Only count arrivals the reader can't see. Someone scrolled up in history
      // shouldn't be yanked to the bottom, but should know something landed.
      if (!atBottomRef.current) {
        const fromOthers = fresh.filter((m) => m.sender?.id !== me?.id).length;
        if (fromOthers) setUnseen((n) => n + fromOthers);
      }
      return [...prev, ...fresh];
    });
    lastTimestampRef.current = rows[rows.length - 1].createdAt;
  }, [chatId, mapIn, me?.id]);

  // Poll only while the screen is focused. It used to run on a bare mount effect,
  // so navigating away left it hitting the server every 3s for as long as the
  // screen stayed in the stack.
  useFocusEffect(useCallback(() => {
    loadMessages();
    pollingRef.current = setInterval(pollNewMessages, POLL_MS);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
  }, [loadMessages, pollNewMessages]));

  const scrollToEnd = (animated = true) => {
    listRef.current?.scrollToEnd({ animated });
    setUnseen(0);
  };

  const deliver = async (draft) => {
    const res = await legendsApi.sendChatMessage(chatId, draft.text);
    setMessages((prev) => prev.map((m) => {
      if (m.id !== draft.id) return m;
      // Swap the optimistic row for the server's, keeping the local id so the
      // list doesn't remount the bubble mid-animation.
      return res.success
        ? { ...res.data, id: res.data?.id || m.id, status: 'sent' }
        : { ...m, status: 'failed' };
    }));
    if (res.success && res.data?.createdAt) lastTimestampRef.current = res.data.createdAt;
  };

  const sendMessage = async () => {
    const text = newMessage.trim();
    // A room with no id can't take a message. This used to fabricate a local
    // bubble that looked sent and never was.
    if (!text || sending || !chatId) return;
    const draft = {
      id: `local-${Date.now()}`,
      text,
      sender: { id: me?.id, firstName: me?.name || 'You', avatarUrl: me?.avatarUrl },
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    setMessages((prev) => [...prev, draft]);
    setNewMessage('');
    setSending(true);
    setTimeout(() => scrollToEnd(true), 50);
    await deliver(draft);
    setSending(false);
  };

  const retry = async (item) => {
    setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, status: 'pending' } : m)));
    await deliver(item);
  };

  // Day separators + which bubbles carry an avatar and a name, computed once per
  // message change rather than per row render.
  const rows = useMemo(() => {
    const out = [];
    messages.forEach((m, i) => {
      const prev = messages[i - 1];
      if (!prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt)) {
        out.push({ kind: 'day', id: `day-${m.id}`, label: dayLabel(m.createdAt) });
      }
      const sameSender = prev && (prev.sender?.id || null) === (m.sender?.id || null);
      const close = prev && (new Date(m.createdAt) - new Date(prev.createdAt)) < GROUP_WINDOW_MS;
      const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
      out.push({ kind: 'msg', id: m.id, msg: m, showMeta: !sameSender || !close || newDay });
    });
    return out;
  }, [messages]);

  const onScroll = (e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distance = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const near = distance < 120;
    atBottomRef.current = near;
    setAtBottom(near);
    if (near && unseen) setUnseen(0);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

      <View style={styles.hero}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.chatAvatarWrap}>
          <Icon name={chatType === 'scout' ? 'telescope' : chatType === 'tournament' ? 'trophy-outline' : 'account-group'} size={18} color={DS.onLime} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle} numberOfLines={1}>{chatName}</Text>
          <Text style={styles.heroSub}>{KIND_LABEL[chatType] || 'Chat'}</Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.msgList, rows.length === 0 && { flex: 1, justifyContent: 'center' }]}
          onScroll={onScroll}
          scrollEventThrottle={16}
          // Only follow new content when the reader is already at the bottom.
          // This used to scrollToEnd unconditionally, so a poll landing while you
          // read history threw you back to the newest message.
          onContentSizeChange={() => { if (atBottomRef.current) listRef.current?.scrollToEnd({ animated: false }); }}
          renderItem={({ item }) => {
            if (item.kind === 'day') {
              return (
                <View style={styles.dayRow}>
                  <View style={styles.dayLine} />
                  <Text style={styles.dayText}>{item.label}</Text>
                  <View style={styles.dayLine} />
                </View>
              );
            }
            // Derived at render, never stored: useCurrentUser resolves async, so
            // baking isMine in at load time marked every message as someone
            // else's whenever the profile arrived after the messages did.
            const mine = !!me?.id && item.msg.sender?.id === me.id;
            return (
              <ChatBubble
                item={item.msg}
                mine={mine}
                showMeta={item.showMeta}
                onRetry={retry}
                styles={styles}
                DS={DS} />
            );
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="message-text-outline" size={48} color={DS.surfaceHighest} />
              <Text style={styles.emptyStateTitle}>No messages yet</Text>
              <Text style={styles.emptyStateSub}>Say hello to start the conversation.</Text>
            </View>
          } />

        {/* Jump back down, with a count of what arrived while you were reading up. */}
        {!atBottom && (
          <TouchableOpacity style={styles.jumpBtn} onPress={() => scrollToEnd(true)} activeOpacity={0.85}>
            <Icon name="chevron-down" size={18} color={DS.onLime} />
            {unseen > 0 && <Text style={styles.jumpCount}>{unseen > 99 ? '99+' : unseen}</Text>}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message…"
          placeholderTextColor={DS.textMuted}
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={2000} />

        <TouchableOpacity
          style={[styles.sendBtn, (!newMessage.trim() || sending) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!newMessage.trim() || sending}>
          <Icon name="send" size={18} color={newMessage.trim() && !sending ? DS.onLime : DS.textMuted} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>);

};

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: DS.surfaceHigh,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4, zIndex: 10
  },
  backBtn: { padding: 4 },
  chatAvatarWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: DS.lime,
    alignItems: 'center', justifyContent: 'center'
  },
  heroTitle: { fontSize: 16, fontWeight: '800', color: DS.textPrimary },
  heroSub: { fontSize: 11, color: DS.textMuted, marginTop: 1 },

  msgList: { padding: 16, gap: 12, paddingBottom: 20 },

  /* Day separator */
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 },
  dayLine: { flex: 1, height: 1, backgroundColor: DS.faint },
  dayText: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.5 },

  bubbleWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubbleWrapMine: { flexDirection: 'row-reverse' },
  // Grouped follow-on message: sits closer to the one above it.
  bubbleWrapTight: { marginTop: -6 },
  bubble: {
    maxWidth: '78%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2, elevation: 1.5,
  },
  bubbleMine: { backgroundColor: DS.lime, borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: DS.surfaceHigh, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: DS.faint
  },
  bubblePending: { opacity: 0.6 },
  bubbleFailed: { backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.coral },
  senderName: { fontSize: 11, fontWeight: '800', color: DS.lime, marginBottom: 4 },
  msgText: { fontSize: 15, color: DS.textPrimary, lineHeight: 22 },
  msgTextMine: { color: DS.onLime },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  msgTime: { fontSize: 10, color: DS.textMuted },
  // Was a hardcoded rgba() tuned for the dark theme — invisible in light mode.
  msgTimeMine: { color: DS.onLime, opacity: 0.6 },

  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  retryText: { fontSize: 11, fontWeight: '800', color: DS.coral },

  /* Jump-to-latest */
  jumpBtn: {
    position: 'absolute', right: 16, bottom: 16,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.lime, borderRadius: 20, paddingHorizontal: 12, height: 36,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 5,
  },
  jumpCount: { fontSize: 12, fontWeight: '900', color: DS.onLime },

  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyStateTitle: { fontSize: 16, fontWeight: '700', color: DS.textPrimary, marginTop: 16, marginBottom: 6 },
  emptyStateSub: { fontSize: 13, color: DS.textMuted, textAlign: 'center' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    backgroundColor: DS.surfaceLow, padding: 16, paddingBottom: Platform.OS === 'ios' ? 24 : 16
  },
  textInput: {
    flex: 1, borderRadius: 24,
    paddingHorizontal: 16, paddingVertical: 9, maxHeight: 100, fontSize: 15,
    color: DS.textPrimary, backgroundColor: DS.surfaceHigh
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: DS.lime,
    alignItems: 'center', justifyContent: 'center'
  },
  sendBtnDisabled: { backgroundColor: DS.surfaceHighest }
});

export default ChatScreen;
