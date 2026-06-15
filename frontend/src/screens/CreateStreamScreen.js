import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

const DS = {
  bg: '#0f131f',
  surfaceLow: '#171b28',
  surfaceHigh: '#262a37',
  surfaceHighest: '#313442',
  lime: '#abd600',
  coral: '#ffb59e',
  blue: '#b7c4ff',
  textPrimary: '#dfe2f3',
  textVariant: '#c3c5d9',
  textMuted: '#8d90a2',
  live: '#ef4444',
};

const CHANNELS = [
  { key: 'own',      label: 'AllIn1', icon: 'play-circle' },
  { key: 'facebook', label: 'Facebook', icon: 'facebook' },
  { key: 'youtube',  label: 'YouTube', icon: 'youtube' },
];
const QUALITIES = ['720p', 'HD', '4K'];

const CreateStreamScreen = ({ navigation }) => {
  const [form, setForm] = useState({
    title: '', description: '', matchId: '', channel: 'own', isPrivate: false, quality: 'HD',
  });
  const [loading, setLoading] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleCreate = async () => {
    if (!form.title.trim()) return Alert.alert('Error', 'Please enter a stream title');
    setLoading(true);
    try {
      const res = await legendsApi.createStream(form);
      if (res.success) {
        Alert.alert('Stream Created!', 'Your stream is ready.', [
          { text: 'Go Live', onPress: () => navigation.navigate('VideoStreaming', { streamId: res.data.id }) },
        ]);
      } else Alert.alert('Error', res.error || 'Failed to create stream');
    } catch { Alert.alert('Error', 'An error occurred'); }
    finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />
      {/* Hero */}
      <View style={styles.hero}>
        {navigation && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-left" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Create Stream</Text>
          <Text style={styles.heroSub}>Go live with your match</Text>
        </View>
        <Icon name="broadcast" size={24} color={DS.textMuted} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        {/* Title */}
        <Text style={styles.fieldLabel}>STREAM TITLE *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Mumbai vs Chennai Live"
          placeholderTextColor={DS.textMuted}
          value={form.title}
          onChangeText={v => set('title', v)}
        />

        {/* Description */}
        <Text style={styles.fieldLabel}>DESCRIPTION</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Describe your stream..."
          placeholderTextColor={DS.textMuted}
          value={form.description}
          onChangeText={v => set('description', v)}
          multiline
          numberOfLines={3}
        />

        {/* Match ID */}
        <Text style={styles.fieldLabel}>MATCH ID (OPTIONAL)</Text>
        <TextInput
          style={styles.input}
          placeholder="Link with live scoring"
          placeholderTextColor={DS.textMuted}
          value={form.matchId}
          onChangeText={v => set('matchId', v)}
        />

        {/* Platform */}
        <Text style={styles.fieldLabel}>STREAMING PLATFORM</Text>
        <View style={styles.chipRow}>
          {CHANNELS.map(c => (
            <TouchableOpacity
              key={c.key}
              style={[styles.chip, form.channel === c.key && styles.chipActive]}
              onPress={() => set('channel', c.key)}
            >
              <Icon name={c.icon} size={15} color={form.channel === c.key ? DS.bg : DS.textMuted} />
              <Text style={[styles.chipText, form.channel === c.key && styles.chipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quality */}
        <Text style={styles.fieldLabel}>QUALITY</Text>
        <View style={styles.chipRow}>
          {QUALITIES.map(q => (
            <TouchableOpacity
              key={q}
              style={[styles.chip, form.quality === q && styles.chipActive]}
              onPress={() => set('quality', q)}
            >
              <Text style={[styles.chipText, form.quality === q && styles.chipTextActive]}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Privacy toggle */}
        <TouchableOpacity
          style={[styles.privacyRow, form.isPrivate && styles.privacyRowActive]}
          onPress={() => set('isPrivate', !form.isPrivate)}
        >
          <Icon
            name={form.isPrivate ? 'lock' : 'earth'}
            size={20}
            color={form.isPrivate ? DS.lime : DS.textMuted}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyTitle}>{form.isPrivate ? 'Private Stream' : 'Public Stream'}</Text>
            <Text style={styles.privacySub}>{form.isPrivate ? 'Only invited users can watch' : 'Anyone can watch'}</Text>
          </View>
          <View style={[styles.toggle, form.isPrivate && styles.toggleActive]}>
            <View style={[styles.toggleThumb, form.isPrivate && styles.toggleThumbActive]} />
          </View>
        </TouchableOpacity>

        {/* Go Live button */}
        <TouchableOpacity
          style={[styles.liveBtn, loading && { opacity: 0.6 }]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={DS.bg} /> : (
            <>
              <Icon name="broadcast" size={20} color={DS.bg} />
              <Text style={styles.liveBtnText}>Start Streaming</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16,
  },
  backBtn: { padding: 4 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  heroSub: { fontSize: 12, color: DS.textMuted, marginTop: 1 },

  body: { padding: 16, gap: 4, paddingBottom: 40 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: DS.textMuted, marginBottom: 6, marginTop: 14, letterSpacing: 1, textTransform: 'uppercase' },
  input: {
    borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: DS.textPrimary,
    backgroundColor: DS.surfaceLow,
  },
  textarea: { height: 80, textAlignVertical: 'top' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 24,
    backgroundColor: DS.surfaceHigh,
  },
  chipActive: { backgroundColor: DS.lime },
  chipText: { fontSize: 13, fontWeight: '600', color: DS.textVariant },
  chipTextActive: { color: DS.bg },

  privacyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14,
    backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16,
  },
  privacyRowActive: { backgroundColor: DS.surfaceHighest },
  privacyTitle: { fontSize: 15, fontWeight: '700', color: DS.textPrimary },
  privacySub: { fontSize: 12, color: DS.textMuted, marginTop: 2 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: DS.surfaceHighest, justifyContent: 'center', padding: 2 },
  toggleActive: { backgroundColor: DS.lime },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: DS.textMuted },
  toggleThumbActive: { alignSelf: 'flex-end', backgroundColor: DS.bg },

  liveBtn: {
    marginTop: 24, backgroundColor: DS.lime, borderRadius: 12, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  liveBtnText: { fontSize: 16, fontWeight: '900', color: DS.bg },
});

export default CreateStreamScreen;
