import { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, KeyboardAvoidingView, Platform, StatusBar, BackHandler } from
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

// A poll, drawn inside the bubble it arrived in.
//
// Results are always visible rather than hidden until you vote. In a squad of
// eleven deciding a ground, who has answered is the useful half — you are
// chasing the four who have not, and hiding the count to preserve some purity
// of opinion is the wrong trade for a team chat.
function PollBody({ item, mine, onVote, styles, DS }) {
  const options = item.poll?.options || [];
  const tally = item.tally || { votes: options.map(() => 0), myVotes: [], voters: 0 };
  const total = tally.votes.reduce((a, b) => a + b, 0);
  const leader = Math.max(0, ...tally.votes);

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.pollHead}>
        <Icon name="poll" size={13} color={mine ? DS.onLime : DS.lime} />
        <Text style={[styles.pollKicker, mine && styles.pollKickerMine]}>
          {item.poll?.multi ? 'Select one or more' : 'Select one'}
        </Text>
      </View>
      <Text style={[styles.pollQuestion, mine && styles.msgTextMine]}>{item.text}</Text>

      {options.map((opt, i) => {
        const count = tally.votes[i] || 0;
        const picked = tally.myVotes.includes(i);
        // Share of the votes cast, not of the members — a poll where three of
        // eleven have answered is still 100% for the option all three chose,
        // and "3 votes" underneath is what carries the turnout.
        const pct = total ? Math.round((count / total) * 100) : 0;
        return (
          <TouchableOpacity key={i} activeOpacity={0.8} onPress={() => onVote(item, i)} style={styles.pollOpt}>
            <View style={[styles.pollFill, { width: `${pct}%` }, picked && styles.pollFillOn,
              count === leader && count > 0 && styles.pollFillLead]} />
            <View style={styles.pollOptRow}>
              <Icon
                name={picked
                  ? (item.poll?.multi ? 'checkbox-marked' : 'check-circle')
                  : (item.poll?.multi ? 'checkbox-blank-outline' : 'circle-outline')}
                size={15}
                color={picked ? DS.lime : DS.textMuted} />
              <Text style={[styles.pollOptTxt, picked && styles.pollOptTxtOn]} numberOfLines={2}>{opt}</Text>
              <Text style={styles.pollPct}>{pct}%</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      <Text style={[styles.pollFoot, mine && styles.pollFootMine]}>
        {tally.voters === 0 ? 'No votes yet'
          : `${tally.voters} ${tally.voters === 1 ? 'vote' : 'votes'}`}
      </Text>
    </View>
  );
}

// Draw a message with its mentions picked out.
//
// The same rule the server notifies on (backend lib/mentions.js): longest names
// first, matched spans consumed, a mention starts at the beginning or after
// whitespace. If these two ever disagree, the app highlights one person and
// wakes another — so they are written to the same spec deliberately.
const ALL_TOKENS = ['everyone', 'all', 'team'];

function renderWithMentions(text, members, styles, mine) {
  const src = String(text || '');
  if (!src.includes('@')) return src;

  const names = [
    ...ALL_TOKENS,
    ...(members || []).map((m) => m.name).filter(Boolean),
  ].sort((a, b) => b.length - a.length);

  const spans = [];
  const taken = [];
  const overlaps = (a, b) => taken.some(([x, y]) => a < y && b > x);
  const escape = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const name of names) {
    const re = new RegExp(`(^|\\s)@${escape(name)}(?![\\w])`, 'gi');
    let m;
    while ((m = re.exec(src))) {
      const start = m.index + m[1].length;
      const end = start + 1 + name.length;
      if (overlaps(start, end)) continue;
      taken.push([start, end]);
      spans.push([start, end]);
    }
  }
  if (!spans.length) return src;

  spans.sort((a, b) => a[0] - b[0]);
  const out = [];
  let cursor = 0;
  spans.forEach(([start, end], i) => {
    if (start > cursor) out.push(src.slice(cursor, start));
    out.push(
      <Text key={`m${i}`} style={[styles.mention, mine && styles.mentionMine]}>
        {src.slice(start, end)}
      </Text>,
    );
    cursor = end;
  });
  if (cursor < src.length) out.push(src.slice(cursor));
  return out;
}

function ChatBubble({ item, mine, showMeta, onRetry, onVote, members, styles, DS }) {
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
        {item.kind === 'poll'
          ? <PollBody item={item} mine={mine} onVote={onVote} styles={styles} DS={DS} />
          : <Text style={[styles.msgText, mine && styles.msgTextMine]}>
              {renderWithMentions(item.text, members, styles, mine)}
            </Text>}
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

  // Voting is optimistic on the tapped row only, then replaced by the server's
  // tally. The thread polls every few seconds, so a slow round trip would
  // otherwise leave the tap looking ignored for up to a poll interval.
  const vote = useCallback(async (msg, optionIndex) => {
    const multi = !!msg.poll?.multi;
    setMessages((prev) => prev.map((m) => {
      if (m.id !== msg.id) return m;
      const t = m.tally || { votes: (m.poll?.options || []).map(() => 0), myVotes: [], voters: 0 };
      const had = t.myVotes.includes(optionIndex);
      const votes = [...t.votes];
      let myVotes;
      if (had) { votes[optionIndex] = Math.max(0, votes[optionIndex] - 1); myVotes = t.myVotes.filter((i) => i !== optionIndex); }
      else if (multi) { votes[optionIndex] += 1; myVotes = [...t.myVotes, optionIndex]; }
      else {
        // Single choice: the previous pick loses its vote in the same frame,
        // which is what the server is about to do.
        for (const i of t.myVotes) votes[i] = Math.max(0, votes[i] - 1);
        votes[optionIndex] += 1; myVotes = [optionIndex];
      }
      const voters = Math.max(0, t.voters + (had && myVotes.length === 0 ? -1 : (!t.myVotes.length && myVotes.length ? 1 : 0)));
      return { ...m, tally: { votes, myVotes, voters } };
    }));
    const res = await legendsApi.voteChatPoll(msg.id, optionIndex);
    if (res.success && res.tally) {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, tally: res.tally } : m)));
    }
  }, []);

  // Who is in the room, for the "@" picker and for highlighting what has
  // already been said. Loaded once per room, not per poll of the thread.
  const [members, setMembers] = useState([]);
  useEffect(() => {
    if (!chatId) return;
    legendsApi.getChatMembers(chatId).then((r) => { if (r.success) setMembers(r.data); });
  }, [chatId]);

  // The "@" picker. `mentionQuery` is null when it is closed; an empty string
  // means "@" was just typed and everyone is on offer.
  const [mentionQuery, setMentionQuery] = useState(null);

  // Reads the word being typed at the caret. Anchored to the END of the text
  // rather than a tracked caret position: RN gives selection events, but the
  // composer is multiline and a caret chased through re-renders is a bug farm.
  // People type a mention as they reach it, which is what this catches.
  const onChangeMessage = useCallback((v) => {
    setNewMessage(v);
    const m = /(^|\s)@([^@\s]*(?:\s[^@\s]*)?)$/.exec(v);
    setMentionQuery(m ? m[2] : null);
  }, []);

  const mentionMatches = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.trim().toLowerCase();
    const pool = members.filter((m) => m.userId !== me?.id);
    if (!q) return pool.slice(0, 6);
    return pool.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, members, me?.id]);

  // Replace the half-typed "@…" with the full name, and leave a trailing space
  // so the next word is not glued onto the mention.
  const insertMention = useCallback((name) => {
    setNewMessage((prev) => `${prev.replace(/(^|\s)@([^@\s]*(?:\s[^@\s]*)?)$/, `$1@${name} `)}`);
    setMentionQuery(null);
  }, []);

  const [pollOpen, setPollOpen] = useState(false);
  const [pollQ, setPollQ] = useState('');
  const [pollOpts, setPollOpts] = useState(['', '']);
  const [pollMulti, setPollMulti] = useState(false);
  const [pollBusy, setPollBusy] = useState(false);

  const resetPoll = () => { setPollQ(''); setPollOpts(['', '']); setPollMulti(false); };

  // Back closes the composer, not the conversation. Without this, backing out
  // of a half-written poll threw away the whole screen and dropped you in the
  // chat list — which is what an overlay costs if you do not claim the button
  // a bottom sheet would have claimed for you.
  useEffect(() => {
    if (!pollOpen) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPollOpen(false);
      resetPoll();
      return true;    // handled — do not let the navigator pop the screen
    });
    return () => sub.remove();
  }, [pollOpen]);

  const createPoll = async () => {
    const question = pollQ.trim();
    const options = pollOpts.map((o) => o.trim()).filter(Boolean);
    if (!question || options.length < 2 || pollBusy || !chatId) return;
    setPollBusy(true);
    const res = await legendsApi.createChatPoll(chatId, { question, options, multi: pollMulti });
    setPollBusy(false);
    if (res.success) {
      setMessages((prev) => [...prev, res.data]);
      setPollOpen(false);
      resetPoll();
      setTimeout(() => scrollToEnd(true), 50);
    }
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
    setMentionQuery(null);
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
                onVote={vote}
                members={members}
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

      {/* Poll composer. A plain overlay rather than a bottom sheet: this screen
          already runs a KeyboardAvoidingView for its own composer, and putting
          a second keyboard-managing container inside it is how the tournament
          form ended up with its footer above the keyboard. */}
      {pollOpen && (
        <View style={styles.pollSheetWrap}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1}
            onPress={() => { setPollOpen(false); resetPoll(); }} />
          <View style={styles.pollSheet}>
            <View style={styles.pollSheetHead}>
              <Text style={styles.pollSheetTitle}>New poll</Text>
              <TouchableOpacity onPress={() => { setPollOpen(false); resetPoll(); }} hitSlop={10}>
                <Icon name="close" size={20} color={DS.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.pollInput}
              placeholder="Ask something…"
              placeholderTextColor={DS.textMuted}
              value={pollQ}
              onChangeText={setPollQ}
              maxLength={200}
              autoFocus />

            {pollOpts.map((opt, i) => (
              <View key={i} style={styles.pollOptRowEdit}>
                <TextInput
                  style={[styles.pollInput, { flex: 1, marginBottom: 0 }]}
                  placeholder={`Option ${i + 1}`}
                  placeholderTextColor={DS.textMuted}
                  value={opt}
                  onChangeText={(v) => setPollOpts((prev) => prev.map((o, j) => (j === i ? v : o)))}
                  maxLength={80} />
                {/* Only past the two a poll needs — removing one of two leaves
                    a poll that cannot be posted. */}
                {pollOpts.length > 2 && (
                  <TouchableOpacity hitSlop={8} onPress={() => setPollOpts((prev) => prev.filter((_, j) => j !== i))}>
                    <Icon name="close-circle-outline" size={19} color={DS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {pollOpts.length < 12 && (
              <TouchableOpacity style={styles.pollAdd} onPress={() => setPollOpts((prev) => [...prev, ''])} activeOpacity={0.8}>
                <Icon name="plus" size={16} color={DS.lime} />
                <Text style={styles.pollAddTxt}>Add option</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.pollMultiRow} onPress={() => setPollMulti((v) => !v)} activeOpacity={0.8}>
              <Icon name={pollMulti ? 'checkbox-marked' : 'checkbox-blank-outline'} size={19}
                color={pollMulti ? DS.lime : DS.textMuted} />
              <Text style={styles.pollMultiTxt}>Allow more than one answer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pollPost, (!pollQ.trim() || pollOpts.filter((o) => o.trim()).length < 2 || pollBusy) && styles.pollPostOff]}
              onPress={createPoll}
              disabled={!pollQ.trim() || pollOpts.filter((o) => o.trim()).length < 2 || pollBusy}
              activeOpacity={0.85}>
              <Text style={styles.pollPostTxt}>{pollBusy ? 'Posting…' : 'Post poll'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Sits directly on top of the composer, where the words are appearing.
          A list that covers the thread would hide the message being replied
          to, which is usually the reason someone is naming a person at all. */}
      {mentionQuery != null && mentionMatches.length > 0 && (
        <View style={styles.mentionBar}>
          {mentionMatches.map((m) => (
            <TouchableOpacity key={m.userId} style={styles.mentionRow} activeOpacity={0.8}
              onPress={() => insertMention(m.name)}>
              <PlayerAvatar name={m.name} avatarUrl={m.avatarUrl} size={26} />
              <Text style={styles.mentionName} numberOfLines={1}>{m.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.inputBar}>
        {/* Polls are for deciding things as a group, so the button lives in
            team and tournament rooms and not in a one-to-one conversation. */}
        {chatType !== 'direct' && chatType !== 'scout' && (
          <TouchableOpacity style={styles.pollBtn} onPress={() => setPollOpen(true)} hitSlop={6}
            accessibilityRole="button" accessibilityLabel="Create a poll">
            <Icon name="poll" size={20} color={DS.lime} />
          </TouchableOpacity>
        )}
        <TextInput
          style={styles.textInput}
          placeholder="Type a message…"
          placeholderTextColor={DS.textMuted}
          value={newMessage}
          onChangeText={onChangeMessage}
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

  // A named person, inside a message. Weight as well as colour, so it still
  // reads as a name on the lime bubble where a colour shift alone would not.
  mention: { color: DS.lime, fontWeight: '800' },
  mentionMine: { color: DS.onLime, fontWeight: '800', textDecorationLine: 'underline' },

  mentionBar: {
    backgroundColor: DS.surfaceLow, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: DS.surfaceHighest, paddingVertical: 4,
  },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  mentionName: { flex: 1, fontSize: 14, fontWeight: '600', color: DS.textPrimary },

  // ── Poll, in the thread ──
  pollHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  pollKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: DS.lime, textTransform: 'uppercase' },
  pollKickerMine: { color: DS.onLime, opacity: 0.85 },
  pollQuestion: { fontSize: 15, fontWeight: '700', color: DS.textPrimary, marginBottom: 2 },
  pollOpt: {
    borderRadius: 10, overflow: 'hidden', backgroundColor: DS.surfaceHighest,
    minWidth: 210, justifyContent: 'center',
  },
  // The bar is behind the label, not beside it: a row that is both the result
  // and the button reads as one thing to tap.
  pollFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: DS.surfaceHigh },
  pollFillLead: { backgroundColor: DS.lime + '2e' },
  pollFillOn: { backgroundColor: DS.lime + '45' },
  pollOptRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9 },
  pollOptTxt: { flex: 1, fontSize: 13.5, color: DS.textPrimary },
  pollOptTxtOn: { fontWeight: '700' },
  pollPct: { fontSize: 12, fontWeight: '800', color: DS.textVariant, fontVariant: ['tabular-nums'] },
  pollFoot: { fontSize: 11, color: DS.textMuted, marginTop: 1 },
  pollFootMine: { color: DS.onLime, opacity: 0.8 },

  // ── Poll composer ──
  pollBtn: { paddingHorizontal: 6, paddingVertical: 8 },
  pollSheetWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000aa', justifyContent: 'flex-end', zIndex: 20 },
  pollSheet: {
    backgroundColor: DS.surfaceLow, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 18, paddingBottom: 26, gap: 10,
  },
  pollSheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  pollSheetTitle: { fontSize: 17, fontWeight: '800', color: DS.textPrimary },
  pollInput: {
    backgroundColor: DS.surfaceHigh, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    color: DS.textPrimary, fontSize: 14.5,
  },
  pollOptRowEdit: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pollAdd: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  pollAddTxt: { fontSize: 13.5, fontWeight: '700', color: DS.lime },
  pollMultiRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4 },
  pollMultiTxt: { fontSize: 13.5, color: DS.textVariant },
  pollPost: { backgroundColor: DS.lime, borderRadius: 999, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  pollPostOff: { opacity: 0.45 },
  pollPostTxt: { fontSize: 14.5, fontWeight: '800', color: DS.onLime },

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
