import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, KeyboardAvoidingView, Platform, StatusBar } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { useCurrentUser } from '../utils/currentUser';















const getTime = (msg) => {
  try {return new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });}
  catch {return '';}
};

const getSenderName = (msg) => {
  if (msg.isMine) return 'You';
  if (msg.sender) return `${msg.sender.firstName} ${msg.sender.lastName || ''}`.trim();
  return 'Member';
};

const getInitial = (msg) => getSenderName(msg)[0]?.toUpperCase() || '?';

function ChatBubble({ item }) {const styles = useThemedStyles(makeStyles);
  const mine = item.isMine;
  return (
    <View style={[styles.bubbleWrap, mine && styles.bubbleWrapMine]}>
      {!mine &&
      <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitial(item)}</Text>
        </View>
      }
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
        {!mine && <Text style={styles.senderName}>{getSenderName(item)}</Text>}
        <Text style={[styles.msgText, mine && styles.msgTextMine]}>{item.text}</Text>
        <View style={styles.timeRow}>
          <Text style={[styles.msgTime, mine && styles.msgTimeMine]}>{getTime(item)}</Text>
          {mine && <Icon name="check-all" size={12} color="rgba(15,19,31,0.5)" style={{ marginLeft: 4 }} />}
        </View>
      </View>
    </View>);

}

const ChatScreen = ({ route, navigation }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const me = useCurrentUser();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const { chatId, chatName = 'Team Chat' } = route.params || {};
  const pollingRef = useRef(null);
  const lastTimestampRef = useRef(null);
  const listRef = useRef(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useEffect(() => {
    loadMessages();
    pollingRef.current = setInterval(pollNewMessages, 3000);
    return () => {if (pollingRef.current) clearInterval(pollingRef.current);};
  }, []);

  const loadMessages = async () => {
    if (!chatId) { setMessages([]); return; }
    const res = await legendsApi.getChatMessages(chatId);
    if (res.success && res.data.length > 0) {
      const mapped = res.data.map((m) => ({ ...m, isMine: m.sender?.id === me?.id }));
      setMessages(mapped);
      lastTimestampRef.current = mapped[mapped.length - 1].createdAt;
    }
  };

  const pollNewMessages = async () => {
    if (!chatId) return;
    const res = await legendsApi.getChatMessages(chatId, lastTimestampRef.current);
    if (res.success && res.data.length > 0) {
      const mapped = res.data.map((m) => ({ ...m, isMine: m.sender?.id === me?.id }));
      setMessages((prev) => {
        const existingIds = new Set(prev.map(p => p.id));
        const filtered = mapped.filter(m => !existingIds.has(m.id));
        return [...prev, ...filtered];
      });
      lastTimestampRef.current = mapped[mapped.length - 1].createdAt;
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    if (chatId) {
      const res = await legendsApi.sendChatMessage(chatId, newMessage.trim());
      if (res.success) setMessages((prev) => [...prev, { ...res.data, isMine: true }]);
    } else {
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        text: newMessage,
        sender: { firstName: 'You', lastName: '' },
        createdAt: new Date().toISOString(),
        isMine: true
      }]);
    }
    setNewMessage('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />
      {/* Hero */}
      <View style={styles.hero}>
        {navigation &&
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-left" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
        }
        <View style={styles.chatAvatarWrap}>
          <Icon name="account-group" size={18} color={DS.bg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>{chatName}</Text>
          <Text style={styles.heroSub}>Team chat</Text>
        </View>
        <TouchableOpacity style={styles.heroAction}>
          <Icon name="dots-vertical" size={22} color={DS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.msgList, messages.length === 0 && { flex: 1, justifyContent: 'center' }]}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => <ChatBubble item={item} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="message-text-outline" size={48} color={DS.surfaceHighest} />
            <Text style={styles.emptyStateTitle}>No messages yet</Text>
            <Text style={styles.emptyStateSub}>Send a message to start the conversation!</Text>
          </View>
        } />
      

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor={DS.textMuted}
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={500} />
        
        <TouchableOpacity
          style={[styles.sendBtn, !newMessage.trim() && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!newMessage.trim()}>
          
          <Icon name="send" size={18} color={DS.bg} />
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
  heroAction: { padding: 4 },

  msgList: { padding: 16, gap: 14, paddingBottom: 20 },

  bubbleWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubbleWrapMine: { flexDirection: 'row-reverse' },
  avatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: DS.surfaceHighest,
    alignItems: 'center', justifyContent: 'center'
  },
  avatarText: { fontSize: 11, fontWeight: '900', color: DS.lime },
  bubble: {
    maxWidth: '78%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2, elevation: 1.5,
  },
  bubbleMine: {
    backgroundColor: DS.lime, borderBottomRightRadius: 4
  },
  bubbleOther: {
    backgroundColor: DS.surfaceHigh, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)'
  },
  senderName: { fontSize: 11, fontWeight: '800', color: DS.lime, marginBottom: 4 },
  msgText: { fontSize: 15, color: DS.textPrimary, lineHeight: 22 },
  msgTextMine: { color: DS.bg },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  msgTime: { fontSize: 10, color: DS.textMuted },
  msgTimeMine: { color: 'rgba(15,19,31,0.5)' },

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