import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, KeyboardAvoidingView, Platform, StatusBar } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';















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
        <Text style={[styles.msgTime, mine && styles.msgTimeMine]}>{getTime(item)}</Text>
      </View>
    </View>);

}

const ChatScreen = ({ route, navigation }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const { chatId, chatName = 'Team Chat' } = route.params || {};
  const pollingRef = useRef(null);
  const lastTimestampRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    loadMessages();
    pollingRef.current = setInterval(pollNewMessages, 3000);
    return () => {if (pollingRef.current) clearInterval(pollingRef.current);};
  }, []);

  const loadMessages = async () => {
    if (!chatId) { setMessages([]); return; }
    const res = await legendsApi.getChatMessages(chatId);
    if (res.success && res.data.length > 0) {
      const mapped = res.data.map((m) => ({ ...m, isMine: false }));
      setMessages(mapped);
      lastTimestampRef.current = mapped[mapped.length - 1].createdAt;
    }
  };

  const pollNewMessages = async () => {
    if (!chatId) return;
    const res = await legendsApi.getChatMessages(chatId, lastTimestampRef.current);
    if (res.success && res.data.length > 0) {
      const mapped = res.data.map((m) => ({ ...m, isMine: false }));
      setMessages((prev) => [...prev, ...mapped]);
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
        contentContainerStyle={styles.msgList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => <ChatBubble item={item} />}
        showsVerticalScrollIndicator={false} />
      

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
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16
  },
  backBtn: { padding: 4 },
  chatAvatarWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: DS.lime,
    alignItems: 'center', justifyContent: 'center'
  },
  heroTitle: { fontSize: 16, fontWeight: '800', color: DS.textPrimary },
  heroSub: { fontSize: 11, color: DS.textMuted, marginTop: 1 },
  heroAction: { padding: 4 },

  msgList: { padding: 16, gap: 12, paddingBottom: 8 },

  bubbleWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubbleWrapMine: { flexDirection: 'row-reverse' },
  avatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: DS.surfaceHighest,
    alignItems: 'center', justifyContent: 'center'
  },
  avatarText: { fontSize: 11, fontWeight: '900', color: DS.lime },
  bubble: {
    maxWidth: '78%', borderRadius: 16, padding: 12
  },
  bubbleMine: {
    backgroundColor: DS.lime, borderBottomRightRadius: 4
  },
  bubbleOther: {
    backgroundColor: DS.surfaceHigh, borderBottomLeftRadius: 4
  },
  senderName: { fontSize: 11, fontWeight: '800', color: DS.lime, marginBottom: 4 },
  msgText: { fontSize: 15, color: DS.textPrimary, lineHeight: 20 },
  msgTextMine: { color: DS.bg },
  msgTime: { fontSize: 10, color: DS.textMuted, marginTop: 4, textAlign: 'right' },
  msgTimeMine: { color: 'rgba(15,19,31,0.5)' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    backgroundColor: DS.surfaceLow, padding: 16
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